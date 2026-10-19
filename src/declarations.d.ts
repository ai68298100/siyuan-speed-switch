declare module "*.scss" {
    const content: Record<string, string>;
    export default content;
}

declare module "./action-palette-ui" {
    export interface IActionPaletteHandle {
        root: HTMLElement;
        searchInput: HTMLInputElement;
        listElement: HTMLElement;
        getState: () => any;
        updateQuery: (newQuery: string) => void;
        selectIndex: (index: number) => void;
        dispose: () => void;
        isDisposed: () => boolean;
    }
    export function mountActionPalette(
        container: HTMLElement,
        actions?: any[],
        options?: any
    ): IActionPaletteHandle;
}