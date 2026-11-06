import './vkbeautify.js';


class SlatSystem {
	constructor(xml_node) {
		this.binding_threshold = 1;
		if (xml_node.querySelector("bindingThreshold")) {
		    this.binding_threshold = parseInt(xml_node.querySelector("bindingThreshold").textContent);
		}
		
		this.slat_types = {};

		const slat_types_node = xml_node.querySelector("PolyominoTypes");
		const slat_types = slat_types_node.querySelectorAll("PolyominoType");
		slat_types.forEach((slat_type_node) => {
			const slat_type = new SlatType();
			slat_type.load_from_xml(slat_type_node);
			this.slat_types[slat_type.name] = slat_type;
		});

		if (xml_node.querySelector("dim_restrictions")) {
			this.dim_restrictions = xml_node.querySelector("dim_restrictions").textContent;
		}

		this.uses_DNA_seqs = false;
		if (xml_node.querySelector("DNA_seqs")) {
			this.uses_DNA_seqs = (xml_node.querySelector("DNA_seqs").textContent == "True");
		}

		if (xml_node.querySelector("marking_domain_label")) {
			this.marking_domain_label = xml_node.querySelector("marking_domain_label").textContent;
		}

		// The kinds of domain modification the system uses (e.g. indirect labels): name -> display color.
		//   Domains name theirs in a <modification> element of their own.
		this.modifications = {};
		for (const child of xml_node.children) {
			if (child.tagName !== 'modifications') {
				continue;
			}
			for (const modification_node of child.children) {
				const name_node = modification_node.querySelector("name");
				if ((modification_node.tagName === 'modification') && name_node) {
					const color_node = modification_node.querySelector("color");
					this.modifications[name_node.textContent] = color_node ? color_node.textContent : null;
				}
			}
		}

		// Top-level elements SlatSim doesn't use itself (for example the <gadgets> section shsgen writes, or
		//   <rotation>) are kept and written back unchanged when the system is saved.
		this.other_elements = otherElements(xml_node, ['bindingThreshold', 'dim_restrictions', 'DNA_seqs',
			'marking_domain_label', 'modifications', 'PolyominoTypes', 'seed', 'assembly']);

		const seed_node = xml_node.querySelector("seed");
		const assembly_node = xml_node.querySelector("assembly");

		if (seed_node) {
			this.seed_assembly = new SlatAssembly(seed_node, this.slat_types, this.uses_DNA_seqs);
			this.validate_assembly(this.seed_assembly);
		} else {
			this.seed_assembly = null;
		}

		// The main assembly starts from a separate copy of the seed (so simulated slats aren't also added to the seed, and
		//   the seed's slats are part of the assembly even if the file's assembly omits them), then adds the file's assembly slats.
		this.assembly = null;
		if (seed_node) {
			this.assembly = new SlatAssembly(seed_node, this.slat_types, this.uses_DNA_seqs);
		}
		if (assembly_node) {
			if (this.assembly === null) {
				this.assembly = new SlatAssembly(assembly_node, this.slat_types, this.uses_DNA_seqs);
			} else {
				this.assembly.AddSlatsFromXml(assembly_node, this.uses_DNA_seqs);
			}
		}
		if (this.assembly !== null) {
			this.validate_assembly(this.assembly);
		}
	}

	output_xml() {
		let xmlDoc = new DOMParser().parseFromString('<PolyominoSystem></PolyominoSystem>', 'text/xml');
		let rootEle = xmlDoc.documentElement;

		let lElement = xmlDoc.createElement('bindingThreshold');
		lElement.textContent = this.binding_threshold;
		rootEle.appendChild(lElement);

		if (this.dim_restrictions !== undefined) {
			lElement = xmlDoc.createElement('dim_restrictions');
			lElement.textContent = this.dim_restrictions;
			rootEle.appendChild(lElement);
		}

		if (this.uses_DNA_seqs) {
			lElement = xmlDoc.createElement('DNA_seqs');
			lElement.textContent = 'True';
			rootEle.appendChild(lElement);
		}

		if ((this.marking_domain_label !== undefined) && (this.marking_domain_label.length > 0)) {
			lElement = xmlDoc.createElement('marking_domain_label');
			lElement.textContent = this.marking_domain_label;
			rootEle.appendChild(lElement);
		}

		if (Object.keys(this.modifications).length > 0) {
			const modificationsEle = xmlDoc.createElement('modifications');
			for (const name in this.modifications) {
				const modificationEle = xmlDoc.createElement('modification');
				lElement = xmlDoc.createElement('name');
				lElement.textContent = name;
				modificationEle.appendChild(lElement);
				if (this.modifications[name] !== null) {
					lElement = xmlDoc.createElement('color');
					lElement.textContent = this.modifications[name];
					modificationEle.appendChild(lElement);
				}
				modificationsEle.appendChild(modificationEle);
			}
			rootEle.appendChild(modificationsEle);
		}

		const slatTypesEle = xmlDoc.createElement('PolyominoTypes');
		for (let slat_type_name in this.slat_types) {
			const slatTypeEle = xmlDoc.createElement('PolyominoType');
			this.slat_types[slat_type_name].output_xml(xmlDoc, slatTypeEle);
			slatTypesEle.appendChild(slatTypeEle);
		}
		rootEle.appendChild(slatTypesEle);

		const seedEle = xmlDoc.createElement('seed');
		const seedPolyEle = xmlDoc.createElement('Polyominoes');
		this.seed_assembly.output_xml(xmlDoc, seedPolyEle);
		seedEle.appendChild(seedPolyEle);
		rootEle.appendChild(seedEle);

		const assemblyEle = xmlDoc.createElement('assembly');
		const assemblyPolyEle = xmlDoc.createElement('Polyominoes');
		this.assembly.output_xml(xmlDoc, assemblyPolyEle);
		assemblyEle.appendChild(assemblyPolyEle);
		rootEle.appendChild(assemblyEle);

		appendOtherElements(xmlDoc, rootEle, this.other_elements);

		let xmlString = new XMLSerializer().serializeToString(xmlDoc);
		return vkbeautify.xml(xmlString);
		//return pd.xml(xmlString);
	}

	validate_assembly(assembly) {
		for (let i=0; i<assembly.slats.length; i++) {
			if (assembly.slats[i]['slat_type_name'] in this.slat_types) {
				//console.log('found slat type ' + assembly.slats[i]['slat_type_name']);
			} else {
				console.log('[ERROR] Slat type ' + assembly.slats[i]['slat_type_name'] + ' found in assembly but not in slat type set!');
			}
		}
	}

	// Simulate up to num_steps slat additions. Returns the number of slats actually added, which is less
	//   than num_steps only if the assembly became terminal (no more slats can attach).
	simulate_steps(num_steps) {
		for (let c=0; c<num_steps; c++) {
			if (!this.assembly.StepForward(this.binding_threshold, this.uses_DNA_seqs, false)) {
				return c;
			}
			if ((num_steps > 50) && (c > 0) && ((c % 50) == 0)) {
				console.log(c + ' of ' + num_steps + ' steps completed.')
			}
		}
		return num_steps;
	}

	// Remove all slats added to the main assembly after the given step
	truncate_to_step(step) {
		this.assembly.TruncateToStep(step, this.uses_DNA_seqs);
	}
}

const dir_U = 0;
const dir_D = 1;
const dir_N = 2;
const dir_S = 3;
const dir_E = 4;
const dir_W = 5;
const dir_map = {'U': dir_U, 'D': dir_D, 'N': dir_N, 'S': dir_S, 'E': dir_E, 'W': dir_W};
const dir_names_list = ['Up', 'Down', 'North', 'South', 'East', 'West'];

const dir_offsets_dict = {'U': [0,0,1], 'D': [0,0,-1], 'N': [0,1,0], 'S': [0,-1,0], 'E': [1,0,0], 'W': [-1,0,0]};
const dir_offsets_list = [[0,0,1], [0,0,-1], [0,1,0], [0,-1,0], [1,0,0], [-1,0,0]];

const opp_dirs_dict = {dir_U: dir_D, dir_D: dir_U, dir_N: dir_S, dir_S: dir_N, dir_E: dir_W, dir_W: dir_E};
const opp_dirs_list = [dir_D, dir_U, dir_S, dir_N, dir_W, dir_E];

class SlatAssembly {
	constructor(xml_node, slat_types, uses_DNA_seqs) {
		this.slat_types = slat_types;
		this.slats = Array();
		this.slat_keys = new Set();	// 'type@translation' of each slat, to detect duplicate slats
		this.location_map = {};
		this.frontier = {};
		this.last_step_added = 0;

		this.create_glue_dir_map();

		this.AddSlatsFromXml(xml_node, uses_DNA_seqs);
	}

	// Add the slats listed in the Polyominoes element of xml_node, skipping any that are already in the assembly
	AddSlatsFromXml(xml_node, uses_DNA_seqs) {
		const assembly_slats_node = xml_node.querySelector("Polyominoes");
		const assembly_slats = assembly_slats_node.querySelectorAll("Polyomino");
		for (let i = 0; i < assembly_slats.length; i++) {
			const assembly_slat = assembly_slats[i];
			const slat_type_name = assembly_slat.querySelector("PolyominoType").textContent;
			const translation = assembly_slat.querySelector("translation").textContent.replace("(", "").replace(")", "").split(",").map(Number);
			let step_added = null;
			if (assembly_slat.querySelector("stepAdded")) {
				step_added = parseInt(assembly_slat.querySelector("stepAdded").textContent);
				if (step_added > this.last_step_added) {
					this.last_step_added = step_added;
				}
			}
			if (this.slat_keys.has(slat_type_name + '@' + translation)) {
				continue;
			}
			const slat_type = this.slat_types[slat_type_name];
			const slat = new SlatType();
			slat.set_from_type(slat_type);
			slat.translate_to(translation);
			this.AddSlat(slat, translation, step_added, uses_DNA_seqs);
		}
	}

	// Remove the slats added after the given step by rebuilding the assembly from the slats that remain. They are
	//   re-added in their original order, so the location map and frontier match what they were at that step.
	TruncateToStep(step, uses_DNA_seqs) {
		const kept_slats = this.slats.filter((slat_dict) => !(slat_dict['step_added'] > step));
		this.slats = Array();
		this.slat_keys = new Set();
		this.location_map = {};
		this.frontier = {};
		this.last_step_added = 0;
		for (const slat_dict of kept_slats) {
			const slat = new SlatType();
			slat.set_from_type(this.slat_types[slat_dict['slat_type_name']]);
			slat.translate_to(slat_dict['translation']);
			this.AddSlat(slat, slat_dict['translation'], slat_dict['step_added'], uses_DNA_seqs);
			if (slat_dict['step_added'] > this.last_step_added) {
				this.last_step_added = slat_dict['step_added'];
			}
		}
	}

	output_xml(xmlDoc, xml_node) {
		for (let i in this.slats) {
			const slat = this.slats[i];
			const pElement = xmlDoc.createElement('Polyomino');

			const typeElement = xmlDoc.createElement('PolyominoType');
			typeElement.textContent = slat['slat_type_name'];
			pElement.appendChild(typeElement);

			const tElement = xmlDoc.createElement('translation');
			tElement.textContent = '(' + slat['translation'] + ')';
			pElement.appendChild(tElement);

			if (slat['step_added'] > 0) {
				const sElement = xmlDoc.createElement('stepAdded');
				sElement.textContent = slat['step_added'];
				pElement.appendChild(sElement);
			}

			xml_node.appendChild(pElement);
		}
	}

	// The glue_dir_map maps domain labels to lists of directions.
	// Each entry in the list of directions is a list of blocks of slat types that have that domain label facing that directions.
	// Each entry in the list of blocks of slat types is a list consisting of the slat type and the offset of the block from the first block of the slat.
	create_glue_dir_map() {
		this.glue_dir_map = {};
		for (const [slat_type_name, slat_type] of Object.entries(this.slat_types)) {
			for (const block of slat_type.blocks) {
				if (block in slat_type.domains_lists) {
					const domains_list = slat_type.domains_lists[block];

					for (let dir = dir_U; dir <= dir_W; dir++) {
						const label = domains_list[dir];
						if (label !== null) {
							if (!Object.keys(this.glue_dir_map).includes(label)) {
								this.glue_dir_map[label] = [null, null, null, null, null, null];
							}
							if (this.glue_dir_map[label][dir] === null) {
								this.glue_dir_map[label][dir] = []
							}
							const first_block = slat_type.blocks[0];
							const block_offset = [block[0] - first_block[0], block[1] - first_block[1], block[2] - first_block[2]];
							this.glue_dir_map[label][dir].push([slat_type.name, block_offset]);
						}
					}
				}
			}
		}
	}

	// Add a slat to the assembly. Note that the drawing_translation is the translation that the slat has been moved to already
	//   and is only used for the drawing (which should be updated to no longer need it).
	AddSlat(slat, drawing_translation, step_added, uses_DNA_seqs) {
		if (this.OverlapsExistingSlat(slat)) {
			console.log("[ERROR] Adding a slat to an existing location!");
			return false;
		} else {
			this.slats.push({'slat_type_name': slat.name, 'translation': drawing_translation, 'step_added': step_added});
			this.slat_keys.add(slat.name + '@' + drawing_translation);
			for (let j=0; j<slat.blocks.length; j++) {
				const block = slat.blocks[j];

				let domains_list = [null, null, null, null, null, null];
				let b_add_to_frontier = false;
				if (block in slat.domains) {
					domains_list = slat.domains_lists[block];
					b_add_to_frontier = true;
				}
				if (block in this.frontier) {
					delete this.frontier[block];
				}
				this.location_map[block] = [domains_list, slat.name];
				if (b_add_to_frontier) {
					this.AddNeighboringLocationsToFrontier(block, domains_list, uses_DNA_seqs);
				}
			}
		}
	}

	AddNeighboringLocationsToFrontier(block, domains_list, uses_DNA_seqs) {
		for (let i=dir_U; i<= dir_W; i++) {
			if (domains_list[i] !== null) {

				// Only add to the frontier if there is some slat type with the complementary glue facing in the opposite
				//   direction (which may not be the case for gridiron glues).
				const domain_to_match = this.get_domain_complement(domains_list[i], uses_DNA_seqs);
				if ((domain_to_match in this.glue_dir_map) && (this.glue_dir_map[domain_to_match][opp_dirs_list[i]] !== null)) {

					const nbr_block = [block[0] + dir_offsets_list[i][0], block[1] + dir_offsets_list[i][1], block[2] + dir_offsets_list[i][2]];
					if (nbr_block in this.location_map) {
						// Don't add this nbr to the frontier - it's occupied
					} else if (nbr_block in this.frontier) {
						// Add to the existing frontier location's direction from which the glue is pointing
						this.frontier[nbr_block][1][opp_dirs_list[i]] = domains_list[i];
					} else {
						// Add this block to the frontier location's direction from which the glue is pointing
						this.frontier[nbr_block] = [nbr_block, [null, null, null, null, null, null]];
						this.frontier[nbr_block][1][opp_dirs_list[i]] = domains_list[i];
					}
				} else {
					console.log("[INFO] No slat type has domain '" + domain_to_match + "' facing in direction '" + dir_names_list[opp_dirs_list[i]] + "', so skipping addition of corresponding frontier location.");
				}
			}
		}

	}

	OverlapsExistingSlat(slat) {
		for (let j=0; j<slat.blocks.length; j++) {
			const block = slat.blocks[j];
			if (block in this.location_map) {
				return true;
			}
		}
		return false
	}

	GetBlockBindingInFrontierLocation(frontier_loc_dirs, domains_list, uses_DNA_seqs) {
		let sum = 0;
		for (let i=dir_U; i<=dir_W; i++) {
			if ((frontier_loc_dirs[i] !== null) && (domains_list[i] !== null)) {
				if (frontier_loc_dirs[i] === this.get_domain_complement(domains_list[i], uses_DNA_seqs)) {
					sum += 1;
				}
			}
		}
		return sum;
	}

	get_domain_complement(domain, uses_DNA_seqs) {
		if (uses_DNA_seqs) {
			let domain_comp = '';
			for (let i = domain.length - 1; i >= 0; i--) {
				if (domain[i] === 'A') {
					domain_comp += 'T';
				} else if (domain[i] === 'T') {
					domain_comp += 'A';
				} else if (domain[i] === 'C') {
					domain_comp += 'G';
				} else if (domain[i] === 'G') {
					domain_comp += 'C';
				} else {
					console.log('[WARNING] Invalid character in DNA sequence: ' + domain);
				}
			}
			return domain_comp;
		} else if (domain.endsWith('*')) {
			return domain.substring(0, domain.length - 1);
		} else {
			return domain + '*';
		}
	}

	StepForward(binding_threshold, uses_DNA_seqs, b_report_nondeterminism) {
		const frontier_locs = Object.keys(this.frontier);
		if (frontier_locs.length === 0) {
			console.log('[INFO] The frontier of the assembly is empty. No slat additions are possible.');
			return false;
		}

		// console.log('Attempting to add to assembly with frontier of size ' + Object.keys(this.frontier).length);
		// console.log(this.frontier);
		const start_index = Math.floor(Math.random() * frontier_locs.length);

		// Select a random frontier location from which to begin (then iterate forward as far as necessary to find a binding slat)
		let b_added = false;
		for (let i=0; i<frontier_locs.length; i++) {
			const frontier_index = (start_index + i) % frontier_locs.length;
			const frontier_loc_coords_str = frontier_locs[frontier_index];
			const frontier_loc_coords = this.frontier[frontier_loc_coords_str][0];
			const frontier_loc_dirs = this.frontier[frontier_loc_coords_str][1];

			//console.log('trying frontier location:')
			//console.log(frontier_loc_coords);
			//console.log(frontier_loc_dirs);

			const attachable_slats = [];

			// Start with a random direction for a possible neighboring domain pointing at this frontier location
			const start_dir = Math.floor(Math.random() * 6);
			for (let dir= 0; dir < 6; dir++) {
				const curr_dir = (start_dir + dir) % 6;


				// See if there is a domain pointing at this frontier location from that direction
				if (frontier_loc_dirs[curr_dir] !== null) {

					// Get the list of blocks of slat types with the complement of that domain in the correct direction
					const domain_to_match = this.get_domain_complement(frontier_loc_dirs[curr_dir], uses_DNA_seqs);
					const matching_blocks = this.glue_dir_map[domain_to_match][curr_dir];

					// Select a random location in the list of matching blocks to begin (then iterate forward as far as necessary to find a binding slat)
					const start_match = Math.floor(Math.random() * matching_blocks.length);
					for (let match_count = 0; match_count < matching_blocks.length; match_count++) {
						const curr_match_index = (start_match + match_count) % matching_blocks.length;

						//	Translate a slat of that type so that it binds with that glue
						const orig_slat_type = this.slat_types[matching_blocks[curr_match_index][0]];
						const slat = new SlatType();
						slat.set_from_type(orig_slat_type);


						// Translation: translate the slat's first block to the frontier location, then offset for the
						// position of the block with the relevant domain relative to the first block
						const translation1 = [frontier_loc_coords[0] - slat.blocks[0][0],
														frontier_loc_coords[1] - slat.blocks[0][1],
														frontier_loc_coords[2] - slat.blocks[0][2]];
						const translation = [translation1[0] - matching_blocks[curr_match_index][1][0],
													translation1[1] - matching_blocks[curr_match_index][1][1],
													translation1[2] - matching_blocks[curr_match_index][1][2]];
						slat.translate_to(translation);

						//	If it doesn't overlap, and it can bind strongly enough, attach it
						if (!this.OverlapsExistingSlat(slat)) {
							let binding_sum = 0;
							for (let b = 0; b < slat.blocks.length; b++) {
								if ((slat.blocks[b] in slat.domains_lists) && (slat.blocks[b] in this.frontier)) {
									binding_sum += this.GetBlockBindingInFrontierLocation(this.frontier[slat.blocks[b]][1], slat.domains_lists[slat.blocks[b]], uses_DNA_seqs);
								}
							}

							if (binding_sum >= binding_threshold) {
								//console.log('Slat of type' + slat.name + ' can bind into location ' + frontier_loc_coords);
								attachable_slats.push(slat);

								if (!b_report_nondeterminism) {
									this.last_step_added += 1;
									this.AddSlat(slat, translation, this.last_step_added, uses_DNA_seqs);
									b_added = true;
								}
								// If we need to report nondeterminism, keep going, otherwise just add this slat.
							}
						}
						if ((attachable_slats.length > 0) && (!b_report_nondeterminism)) {
							break;
						}
					}
				}
				if ((attachable_slats.length > 0) && (!b_report_nondeterminism)) {
					break;
				}
			}
			if (attachable_slats.length > 0) {
				break;
			}
		}
		return b_added;
	}
}

// Elements of a slat type or domain that SlatSim doesn't use itself (for example the scaffold_sequence,
// scaffold_nick_indices and scaffold_start_index of a DNA slat type, or a domain's io_dir_hint and strength)
// are kept as XML strings and written back unchanged, so saving a system doesn't lose them.
function otherElements(xml_node, known_tags) {
	const out = [];
	for (const child of xml_node.children) {
		if (!known_tags.includes(child.tagName)) {
			out.push(new XMLSerializer().serializeToString(child));
		}
	}
	return out;
}

function appendOtherElements(xmlDoc, xml_node, other_elements) {
	for (const xml_string of other_elements || []) {
		const element = new DOMParser().parseFromString(xml_string, 'text/xml').documentElement;
		xml_node.appendChild(xmlDoc.importNode(element, true));
	}
}

class SlatType {
	constructor() {
		this.name = null;
		this.color = null;
		this.b_seed_only = false;
		this.blocks = [];
		this.domains = {};
		this.domains_lists = {};
		this.other_elements = [];
	}

	set_from_type(slat_type) {
		if (slat_type !== null) {
			this.name = slat_type.name;
			this.color = slat_type.color;
			this.b_seed_only = slat_type.b_seed_only;
			this.other_elements = slat_type.other_elements.slice();

			for (let j = 0; j < slat_type.blocks.length; j++) {
				const num_block = [parseInt(slat_type.blocks[j][0]), parseInt(slat_type.blocks[j][1]), parseInt(slat_type.blocks[j][2])];
				this.blocks.push(num_block);
				if (slat_type.blocks[j] in slat_type.domains) {
					this.domains[num_block] = structuredClone(slat_type.domains[slat_type.blocks[j]]);
					this.domains_lists[num_block] = structuredClone(slat_type.domains_lists[slat_type.blocks[j]]);
				}
			}
		}
	}

	output_xml(xmlDoc, xml_node) {
		let lElement = xmlDoc.createElement('name');
		lElement.textContent = this.name;
		xml_node.appendChild(lElement);

		if (this.color !== null) {
			lElement = xmlDoc.createElement('color');
			lElement.textContent = this.color;
			xml_node.appendChild(lElement);
		}

		if (this.concentration !== null) {
			lElement = xmlDoc.createElement('concentration');
			lElement.textContent = this.concentration;
			xml_node.appendChild(lElement);
		}

		if (this.b_seed_only) {
			lElement = xmlDoc.createElement('b_seed_only');
			lElement.textContent = 'True';
			xml_node.appendChild(lElement);
		}

		appendOtherElements(xmlDoc, xml_node, this.other_elements);

		const blocksElement = xmlDoc.createElement('blocks');
		for (let b = 0; b < this.blocks.length; b++) {
			const block = this.blocks[b];
			const bElement = xmlDoc.createElement('block');

			const cElement = xmlDoc.createElement('coords');
			cElement.textContent = '(' + block + ')';
			bElement.appendChild(cElement);

			const domainsElement = xmlDoc.createElement('domains');
			if (block in this.domains) {
				for (let d = 0; d < this.domains[block].length; d++) {
					const domainElement = xmlDoc.createElement('domain');

					const labelElement = xmlDoc.createElement('label');
					labelElement.textContent = this.domains[block][d]['label'];
					domainElement.appendChild(labelElement);

					const dirElement = xmlDoc.createElement('direction');
					dirElement.textContent = this.domains[block][d]['direction'];
					domainElement.appendChild(dirElement);

					appendOtherElements(xmlDoc, domainElement, this.domains[block][d]['other_elements']);

					domainsElement.appendChild(domainElement);
				}
			}
			bElement.appendChild(domainsElement);

			blocksElement.appendChild(bElement);
		}
		xml_node.appendChild(blocksElement);
	}

	load_from_xml(xml_node) {
		this.name = xml_node.querySelector("name").textContent;
		this.color = null;
		if (xml_node.querySelector("color")) {
			this.color = xml_node.querySelector("color").textContent;
		}
		if (xml_node.querySelector("concentration")) {
			this.concentration = xml_node.querySelector("concentration").textContent;
		}
		this.b_seed_only = false;
		if (xml_node.querySelector("b_seed_only")) {
			const text = xml_node.querySelector("b_seed_only").textContent;
			if (text == 'true' || text == 'True') {
				this.b_seed_only = true;
			}
		}
		this.other_elements = otherElements(xml_node, ['name', 'color', 'concentration', 'b_seed_only', 'blocks']);

		const blocks_node = xml_node.querySelector("blocks");
		const blocks = blocks_node.querySelectorAll("block");
		for (let i = 0; i < blocks.length; i++) {
			const coords = blocks[i].querySelector("coords").textContent.replace("(", "").replace(")", "").split(",").map(Number);
			this.blocks.push(coords);

			if (blocks[i].querySelector("domains")) {
				const domains_node = blocks[i].querySelector("domains");
				const domains = domains_node.querySelectorAll("domain");
				for (let j = 0; j < domains.length; j++) {
					const domain_node = domains[j];
					const label = domain_node.querySelector("label").textContent;
					const direction = domain_node.querySelector("direction").textContent;
					const domain_dict = {'label': label, 'direction': direction,
										 'other_elements': otherElements(domain_node, ['label', 'direction'])};
					if (domain_node.querySelector("color")) {
						domain_dict['color'] = domain_node.querySelector("color").textContent;
					}
					// Kept in other_elements too, so it is saved unchanged
					if (domain_node.querySelector("modification")) {
						domain_dict['modification'] = domain_node.querySelector("modification").textContent;
					}
					if (coords in this.domains) {
						this.domains[coords].push(domain_dict)
					} else {
						this.domains[coords] = Array(domain_dict);
					}
				}
			}
		}

		for (const block of this.blocks) {
			if (block in this.domains) {
				this.domains_lists[block] = [null, null, null, null, null, null];
				for (let k = 0; k < this.domains[block].length; k++) {
					const domain = this.domains[block][k];
					this.domains_lists[block][dir_map[domain['direction']]] = domain['label'];
				}
			}
		}
	}

	get_translated_block(block, translation) {
		return [block[0]+translation[0], block[1]+translation[1], block[2]+translation[2]];
	}

	translate_to(destination) {
		const new_blocks = Array();
		const new_domains = {};
		const new_domains_lists = {};

		const origin_trans = this.get_translated_block([0,0,0], [-this.blocks[0][0], -this.blocks[0][1], -this.blocks[0][2]]);
		for (let j=0; j<this.blocks.length; j++) {
			const block = this.blocks[j];
			const pre_trans_block = this.get_translated_block(block, origin_trans);
			const trans_block = this.get_translated_block(pre_trans_block, destination);
			new_blocks.push(trans_block);

			if (block in this.domains) {
				new_domains[trans_block] = this.domains[block];
				new_domains_lists[trans_block] = this.domains_lists[block];
			}
		}
		this.blocks = new_blocks;
		this.domains = new_domains;
		this.domains_lists = new_domains_lists;
	}

	is_horizontal() {
		if (this.blocks.length < 2) {
			return false;
		} else {
			if (this.blocks[0][0] !== this.blocks[1][0]) {
				return true;
			} else {
				return false;
			}
		}
	}
}

export { SlatSystem, SlatType };
