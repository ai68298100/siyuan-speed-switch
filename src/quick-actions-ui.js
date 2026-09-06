function appendIcon(document, host, icon) {
    const iconHost = document.createElement("span");
    iconHost.className = "sw-setting__picker-icon";
    if (/^icon[A-Za-z0-9_-]+$/.test(icon || "") && document.getElementById(icon)) {
        iconHost.innerHTML = `<svg aria-hidden="true"><use xlink:href="#${icon}"></use></svg>`;
    } else {
        iconHost.innerHTML = '<svg aria-hidden="true"><use xlink:href="#iconFile"></use></svg>';
    }
    host.appendChild(iconHost);
}

/**
 * Mounts a picker inside the settings panel. Keeping it in the dialog's own
 * scroll tree avoids SiYuan Menu positioning/z-index differences on Android.
 */
function mountQuickActionPicker(options) {
    const {trigger, host, candidates, searchPlaceholder, emptyText, onSelect} = options;
    const existing = host.querySelector(".sw-setting__quick-picker");
    if (existing) {
        existing.remove();
        trigger.setAttribute("aria-expanded", "false");
        return null;
    }

    const document = host.ownerDocument;
    const picker = document.createElement("div");
    picker.className = "sw-setting__quick-picker";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "b3-text-field sw-setting__quick-picker-search";
    search.placeholder = searchPlaceholder || "";
    search.setAttribute("aria-label", searchPlaceholder || "Search");
    const results = document.createElement("div");
    results.className = "sw-setting__quick-picker-results";
    picker.append(search, results);
    host.appendChild(picker);
    trigger.setAttribute("aria-expanded", "true");

    const render = () => {
        const keyword = search.value.trim().toLocaleLowerCase();
        const visible = candidates.filter((candidate) => !keyword
            || String(candidate.searchText || `${candidate.label} ${candidate.secondary || ""}`)
                .toLocaleLowerCase().includes(keyword));
        results.innerHTML = "";
        if (visible.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw-setting__quick-picker-empty";
            empty.textContent = emptyText || "";
            results.appendChild(empty);
            return;
        }
        const groups = new Map();
        visible.forEach((candidate) => {
            const key = candidate.group || "";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(candidate);
        });
        groups.forEach((items, group) => {
            const section = document.createElement("section");
            section.className = "sw-setting__quick-picker-group";
            if (group) {
                const heading = document.createElement("div");
                heading.className = "sw-setting__quick-picker-heading";
                heading.textContent = group;
                section.appendChild(heading);
            }
            const grid = document.createElement("div");
            grid.className = "sw-setting__quick-picker-grid";
            items.forEach((candidate) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "sw-setting__quick-picker-item";
                button.dataset.candidateId = candidate.id;
                appendIcon(document, button, candidate.icon);
                const copy = document.createElement("span");
                copy.className = "sw-setting__quick-picker-copy";
                const label = document.createElement("span");
                label.className = "sw-setting__quick-picker-label";
                label.textContent = candidate.label;
                copy.appendChild(label);
                if (candidate.secondary) {
                    const secondary = document.createElement("span");
                    secondary.className = "sw-setting__quick-picker-secondary";
                    secondary.textContent = candidate.secondary;
                    copy.appendChild(secondary);
                }
                button.appendChild(copy);
                button.addEventListener("click", () => {
                    trigger.setAttribute("aria-expanded", "false");
                    picker.remove();
                    onSelect(candidate);
                });
                grid.appendChild(button);
            });
            section.appendChild(grid);
            results.appendChild(section);
        });
    };

    search.addEventListener("input", render);
    render();
    search.focus({preventScroll: true});
    return picker;
}

module.exports = {mountQuickActionPicker};
