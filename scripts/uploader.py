import shutil
import subprocess
import os
from time import strftime as date
import glob
import ftputil

##################################################
# Requirements:
#  pip3 install ftputil
#  pip3 install glob2
##################################################


##################################################
# Configuration variables
#
# FTP server vars:
ftpServer = 'ftp.self-assembly.net'
ftpUser   = 'softwareupload@self-assembly.net'
# The FTP password is read from a file that is not in the repository: by default
# ~/.slatsim_ftp_password, or the file named by the SLATSIM_FTP_PASSWORD_FILE
# environment variable. The file holds just the password.
ftpPassFile = os.environ.get('SLATSIM_FTP_PASSWORD_FILE', os.path.expanduser('~/.slatsim_ftp_password'))
ftpDir    = "software/SlatViewer/"
#
# Location of the source directory relative to this script (only modify the first
# sourceDir variable, the second will turn it into an absolute path)
sourceDir = "../"
sourceDir = os.path.join(os.path.dirname(os.path.realpath(__file__)), sourceDir)
#
# File patterns to use for finding the source files to package
sourceFiles = [('.','index.html'), ('.','main.css'), ('.','slat_system.mjs'), ('.','vkbeautify.js'), ('build', '*.js'), ('jsm/controls', 'OrbitControls.js'), ('jsm/math', 'OBB.js'), ('jsm/libs', 'lil-gui.module.min.js')]
#
# Name of the file containing the release notes
releaseNotes = "SlatViewer-ReleaseNotes.txt"
#
# Location of the packaging directory **relative to the source directory**
packagingDir = "packaging"
#
# Prefix for output directory names
outputPrefix = "SlatViewer"
#
# Format for date/time stampe
dateTime = date("%Y-%m-%d-%H-%M")
#
# Location of the directory for the local copy of the package
localDestination = f'{sourceDir}/{packagingDir}/{outputPrefix}-{dateTime}'
#
# Names of the output directories on the FTP server (relative to 'ftpDir' set above)
remoteDestinationGeneric  = f'{outputPrefix}-latest'
remoteDestinationSpecific = f'{outputPrefix}-{dateTime}'
remoteDestinations = [remoteDestinationGeneric, remoteDestinationSpecific]
#
##################################################


##################################################
# Utility functions

# Upload the full contents (recursively) of localDir to the ftpDir directory on ftp_host
def upload_dir(localDir, ftpDir, ftp_host):
	if(ftp_host.path.exists(ftpDir) != True):                   
		ftp_host.makedirs(ftpDir)
		print("  created directory '" + ftpDir + "'")

	list = os.listdir(localDir)
	for fname in list:
		if os.path.isdir(localDir + fname):
			if(ftp_host.path.exists(ftpDir + fname) != True):                   
				ftp_host.makedirs(ftpDir + fname)
				print("  created directory '" + ftpDir + fname + "'")
			upload_dir(localDir + fname + "/", ftpDir + fname + "/", ftp_host)
		else:               
			if(ftp_host.upload_if_newer(localDir + fname, ftpDir + fname)):
				print("  uploaded file '" + ftpDir + fname + "'")
			else:
				print("  Warning: '" + localDir + fname + "' has already been uploaded")


# Find all files (recursively) in directory startPath that match the mask
def getFileNames(startPath, mask):
	fileNames = []
	for fileName in glob.glob(f'{startPath}/{mask}'):
		if os.path.isdir(fileName):
			fileNames += getFileNames(f'{fileName}', mask)
		else:
			fileNames.append(fileName.replace('\\','/'))
	return fileNames



##################################################
# Main script execution

print("Using source directory '" + sourceDir + "'")
os.chdir(sourceDir)

# TODO: Update the release notes (if desired)
if False:
	with open(releaseNotes, "a") as myfile:
		myfile.write("\nVersion " + dateTime + ":\n\n")
		myfile.close()
	result = subprocess.check_output("notepad.exe " + releaseNotes, shell=True)

# Collect the names of the source files
fileNames = []
for (dir, mask) in sourceFiles:
	fileNames += getFileNames(dir, mask)
print(f'Found the following source files:\n{fileNames}\n')

# Copy the source files into the local packaging directory
os.makedirs(localDestination)
for file in fileNames:
	destination = f'{localDestination}/{file}'
	dirname = os.path.dirname(destination)
	if not os.path.isdir(dirname):
		os.makedirs(dirname)
	shutil.copy(file, destination)
print(f"Done copying source files to '{localDestination}'")

# Read the FTP password
try:
	with open(ftpPassFile) as passFile:
		ftpPass = passFile.read().strip()
except OSError as error:
	raise SystemExit(f"Can't read the FTP password from '{ftpPassFile}' ({error.strerror}). Put the password in that file, or name another file with SLATSIM_FTP_PASSWORD_FILE.")

# Upload the 'packaged' files into the destination folder(s) on the FTP server
with ftputil.FTPHost(ftpServer, ftpUser, ftpPass) as ftp_host:
	print(f'Connected to {ftpServer}')
	for destination in remoteDestinations:
		currDestination = f'{ftpDir}/{destination}/'
		print(" Uploading package to '" + currDestination + "'...")
		ftp_host.rmtree(currDestination, ignore_errors=True)
		upload_dir(f'{localDestination}/', currDestination, ftp_host)
print(f'Done packaging and uploading {outputPrefix}!\n')
	

