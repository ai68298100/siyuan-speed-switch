function setOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

function setPending(select, retry, loadingLabel, retrying) {
    select.replaceChildren();
    setOption(select, "", loadingLabel);
    select.disabled = true;
    retry.hidden = !retrying;
    retry.disabled = retrying;
    if (retrying) retry.setAttribute("aria-busy", "true");
    else retry.removeAttribute("aria-busy");
}

function renderResult(select, retry, result, labels, currentValue) {
    select.replaceChildren();
    if (!result || result.failed === true || !Array.isArray(result.notebooks)) {
        setOption(select, "", labels.failed);
        select.disabled = true;
        retry.hidden = false;
        retry.disabled = false;
        retry.removeAttribute("aria-busy");
        return {failed: true, value: ""};
    }

    setOption(select, "", labels.placeholder);
    result.notebooks.forEach((notebook) => {
        if (notebook && notebook.id) setOption(select, notebook.id, notebook.name || notebook.id);
    });
    if (currentValue && !result.notebooks.some((notebook) => notebook?.id === currentValue)) {
        setOption(select, currentValue, `${currentValue} · ${labels.unavailable}`);
    }
    select.value = currentValue || "";
    select.disabled = false;
    retry.hidden = true;
    retry.disabled = false;
    retry.removeAttribute("aria-busy");
    return {failed: false, value: select.value};
}

function runNotebookLoad(options) {
    const {select, retry, labels, load, isDisposed, currentValue, onLoaded, retrying} = options;
    if (isDisposed()) return Promise.resolve();

    setPending(select, retry, labels.loading, retrying);
    let request;
    try {
        request = load();
    } catch (error) {
        request = Promise.reject(error);
    }

    return Promise.resolve(request).then((result) => {
        if (isDisposed()) return;
        const settled = renderResult(select, retry, result, labels, currentValue());
        if (!settled.failed) onLoaded(settled.value);
    }, () => {
        if (isDisposed()) return;
        renderResult(select, retry, {failed: true}, labels, "");
    });
}

module.exports = {runNotebookLoad};
