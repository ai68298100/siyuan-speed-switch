"use strict";

let sequence = 0;

/** Give native settings controls the visible row title and description. */
function bindSettingControlSemantics(item, title, description, action, labels = {}) {
    const id = "sw-setting-" + (++sequence);
    title.id = id + "-title";
    if (description) description.id = id + "-description";
    const selector = "input:not([type='hidden']), select, textarea, button, [role='group'], [role='radiogroup']";
    const controls = [...(action.matches(selector) ? [action] : []), ...action.querySelectorAll(selector)];
    const fields = controls.filter((control) => control.matches("input, select, textarea"));
    if (fields.length === 1) {
        if (!fields[0].id) fields[0].id = id + "-control";
        title.htmlFor = fields[0].id;
    } else {
        // The heading names a group when a row contains several controls.
        action.setAttribute("role", action.getAttribute("role") || "group");
        if (!action.hasAttribute("aria-label") && !action.hasAttribute("aria-labelledby")) {
            action.setAttribute("aria-labelledby", title.id);
        }
    }
    controls.forEach((control) => {
        const labelled = control.getAttribute("aria-label")?.trim() || control.getAttribute("aria-labelledby")?.trim();
        const nativeLabel = Array.from(control.labels || []).some((label) => label.textContent.trim());
        const textButton = control.tagName === "BUTTON" && control.textContent.trim();
        if (!labelled && !nativeLabel && !textButton) {
            if (fields.length > 1 && fields.includes(control)) {
                const kind = control.type === "range" ? labels.slider : control.type === "number" ? labels.number : "";
                const suffix = kind || control.getAttribute("placeholder") || String(fields.indexOf(control) + 1);
                control.setAttribute("aria-label", title.textContent + " · " + suffix);
            } else {
                control.setAttribute("aria-labelledby", title.id);
            }
        }
        if (description) {
            const tokens = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
            tokens.add(description.id);
            control.setAttribute("aria-describedby", [...tokens].join(" "));
        }
    });
    return item;
}

module.exports = {bindSettingControlSemantics};
