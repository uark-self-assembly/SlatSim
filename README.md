# SlatSim

A browser-based viewer and simulator for abstract crisscross slat systems. A slat system is an XML file
(`PolyominoSystem`); the `examples` folder has some.

## Running it

SlatSim is plain JavaScript with no build step, but its modules have to be served over HTTP rather than opened
as a file:

```bash
python3 test-web-server.py
```

then open <http://localhost:8000>. Use **File → Load System** to open a slat system. The files the page needs
are `index.html`, `main.css`, `vkbeautify.js`, `slat_system.mjs`, `build/` and `jsm/`.

## Simulation

The **Simulation** panel shows the current step. You can step or play forward and backward, jump to the first or
last step, and drag the step slider. Stepping or playing past the last step simulates new steps when **Simulate
New Steps** is checked. **Binding Threshold** shows the system's threshold; changing it deletes any steps after the
current step. Keyboard: ←/→ step, Shift+←/→ play, Space play/pause, Home/End first/last step.

## Domain modifications

A domain may name a modification, for example an indirect-labelling tail on its staple:
`<domain><label>…</label><direction>D</direction><modification>indirect_label_ROX</modification></domain>`.
The system lists the modifications it uses, with a colour for each, in a top-level section:

```xml
<modifications>
  <modification><name>indirect_label_ROX</name><color>red</color></modification>
  <modification><name>indirect_label_FAM</name><color>limegreen</color></modification>
</modifications>
```

Each modified domain gets a small block in its modification's colour at the tip of its handle (magenta if the
modification has no colour); **Drawing Options → View Modifications** shows or hides them, and the mouse-over
information names the modification. Saving keeps both.

## URL options and embedding

These URL parameters set up the page when it loads:

| Parameter | Meaning |
| --- | --- |
| `system` | URL of a slat system file on the same site (relative or absolute) |
| `name` | File name to show and save under (defaults to the last part of `system`) |
| `step` | Step to show once it has loaded (defaults to the last step) |
| `controls=closed` | Start with the control panel collapsed (useful in a small inline view) |
| `embed=1` | Embedded mode, for showing SlatSim in an iframe of another page on the same site |

For example, `index.html?embed=1&system=/files/42/download&name=ribbon.xml&step=10`.

In embedded mode, **Save System** hands the system to the surrounding page instead of downloading it, and
**Load System** is hidden. The two pages talk with `window.postMessage`, same origin only, sending JSON strings:

| From SlatSim to the page | When |
| --- | --- |
| `{"type": "slatsim:ready"}` | SlatSim has started and is listening |
| `{"type": "slatsim:loaded", "name", "steps", "binding_threshold"}` | A system has loaded; `steps` is its last step |
| `{"type": "slatsim:error", "message"}` | A system couldn't be loaded |
| `{"type": "slatsim:modified", "modified"}` | The system gained unsaved changes (`true`) or was saved (`false`) |
| `{"type": "slatsim:save", "filename", "content"}` | The user chose Save System; `content` is the slat system XML |

| From the page to SlatSim | Effect |
| --- | --- |
| `{"type": "slatsim:load", "content", "name"}` | Replace the current system with this XML |
| `{"type": "slatsim:saved"}` | The page stored the saved system, so there are no unsaved changes |
| `{"type": "slatsim:step", "step"}` | Show this step |

Simulated steps and a changed binding threshold count as unsaved changes. While there are any, the page title
starts with `*`, so the surrounding page can also check `iframe.contentDocument.title` (for example, to warn before
leaving the page).

## License

SlatSim is released under the MIT License (see `LICENSE`). The bundled three.js (`build/`, `jsm/`) and lil-gui
keep their own MIT licenses, and vkbeautify is MIT/GPL dual-licensed.
