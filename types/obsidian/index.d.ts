// Fallback declarations for the Obsidian API surface this plugin uses.
//
// Not used in a normal checkout: tsconfig `paths` lists node_modules/obsidian first, so the
// build always type-checks against the real, complete definitions
// (https://github.com/obsidianmd/obsidian-api). This file only takes over where the sources are
// linted without installing dependencies, in which case every `obsidian` import would resolve to
// TypeScript's `error` type and every use of it would look like an unchecked `any`.
//
// Scope: only what `main.ts` and `src/**` touch.

interface DomElementInfo {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
}

interface SvgElementInfo {
  cls?: string | string[];
  attr?: Record<string, string | number | boolean | null>;
  parent?: Node;
  prepend?: boolean;
}

interface Node {
  doc: Document;
  win: Window;
  constructorWin: Window;
  detach(): void;
  empty(): void;
  insertAfter<T extends Node>(node: T, child: Node | null): T;
  indexOf(other: Node): number;
  setChildrenInPlace(children: Node[]): void;
  appendText(val: string): void;
  instanceOf<T>(type: new () => T): this is T;
}

interface Element extends Node {
  getText(): string;
  setText(val: string | DocumentFragment): void;
  addClass(...classes: string[]): void;
  addClasses(classes: string[]): void;
  removeClass(...classes: string[]): void;
  removeClasses(classes: string[]): void;
  toggleClass(classes: string | string[], value: boolean): void;
  hasClass(cls: string): boolean;
  setAttr(qualifiedName: string, value: string | number | boolean | null): void;
  setAttrs(obj: Record<string, string | number | boolean | null>): void;
  getAttr(qualifiedName: string): string | null;
  matchParent(selector: string, lastParent?: Element): Element | null;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K];
  createDiv(o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
  createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
  createSvg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    o?: SvgElementInfo | string,
    callback?: (el: SVGElementTagNameMap[K]) => void,
  ): SVGElementTagNameMap[K];
}

interface HTMLElement extends Element {
  show(): void;
  hide(): void;
  toggle(show: boolean): void;
  setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
  setCssProps(props: Record<string, string>): void;
  onClickEvent(listener: (this: HTMLElement, ev: MouseEvent) => void): void;
  addEventListener(type: string, listener: (ev: Event) => void, options?: boolean | AddEventListenerOptions): void;
}

interface DocumentFragment extends Node {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K];
  createDiv(o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
  createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
}

declare function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  o?: DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K];
declare function createDiv(o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
declare function createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
declare function createFragment(callback?: (el: DocumentFragment) => void): DocumentFragment;
declare function createSvg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  o?: SvgElementInfo | string,
  callback?: (el: SVGElementTagNameMap[K]) => void,
): SVGElementTagNameMap[K];

declare let activeWindow: Window;
declare let activeDocument: Document;
declare function sleep(ms: number): Promise<void>;

declare module "obsidian" {
  import { Extension } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";

  export interface EventRef {
    // Opaque handle returned by on(); passed back to offref().
    readonly id?: string;
  }

  export interface Events {
    on(name: string, callback: (...data: never[]) => void, ctx?: unknown): EventRef;
    off(name: string, callback: (...data: never[]) => void): void;
    offref(ref: EventRef): void;
    trigger(name: string, ...data: unknown[]): void;
  }

  export class Component {
    load(): void;
    // Obsidian awaits nothing here, but a plugin's onload is routinely async, so the base signature
    // admits a promise rather than forcing every subclass to widen it.
    onload(): void | Promise<void>;
    unload(): void;
    onunload(): void;
    addChild<T extends Component>(component: T): T;
    removeChild<T extends Component>(component: T): T;
    register(cb: () => unknown): void;
    registerEvent(eventRef: EventRef): void;
    registerDomEvent(el: Window | Document | HTMLElement, type: string, callback: (ev: Event) => unknown): void;
    registerInterval(id: number): number;
  }

  export abstract class TAbstractFile {
    vault: Vault;
    path: string;
    name: string;
    parent: TFolder | null;
  }

  export class TFile extends TAbstractFile {
    stat: { ctime: number; mtime: number; size: number };
    basename: string;
    extension: string;
  }

  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
    isRoot(): boolean;
  }

  export interface DataWriteOptions {
    ctime?: number;
    mtime?: number;
  }

  export interface Stat {
    type: "file" | "folder";
    ctime: number;
    mtime: number;
    size: number;
  }

  export interface DataAdapter {
    getName(): string;
    exists(normalizedPath: string, sensitive?: boolean): Promise<boolean>;
    stat(normalizedPath: string): Promise<Stat | null>;
    read(normalizedPath: string): Promise<string>;
    readBinary(normalizedPath: string): Promise<ArrayBuffer>;
    write(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
    writeBinary(normalizedPath: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>;
    append(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
    process(normalizedPath: string, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;
    getResourcePath(normalizedPath: string): string;
    mkdir(normalizedPath: string): Promise<void>;
    list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
    trashSystem(normalizedPath: string): Promise<boolean>;
    trashLocal(normalizedPath: string): Promise<void>;
    rmdir(normalizedPath: string, recursive: boolean): Promise<void>;
    remove(normalizedPath: string): Promise<void>;
    rename(normalizedPath: string, normalizedNewPath: string): Promise<void>;
    copy(normalizedPath: string, normalizedNewPath: string): Promise<void>;
  }

  export class FileSystemAdapter implements DataAdapter {
    getName(): string;
    getBasePath(): string;
    getFullPath(normalizedPath: string): string;
    exists(normalizedPath: string, sensitive?: boolean): Promise<boolean>;
    stat(normalizedPath: string): Promise<Stat | null>;
    read(normalizedPath: string): Promise<string>;
    readBinary(normalizedPath: string): Promise<ArrayBuffer>;
    write(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
    writeBinary(normalizedPath: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>;
    append(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
    process(normalizedPath: string, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;
    getResourcePath(normalizedPath: string): string;
    mkdir(normalizedPath: string): Promise<void>;
    list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
    trashSystem(normalizedPath: string): Promise<boolean>;
    trashLocal(normalizedPath: string): Promise<void>;
    rmdir(normalizedPath: string, recursive: boolean): Promise<void>;
    remove(normalizedPath: string): Promise<void>;
    rename(normalizedPath: string, normalizedNewPath: string): Promise<void>;
    copy(normalizedPath: string, normalizedNewPath: string): Promise<void>;
  }

  export class Vault implements Events {
    adapter: DataAdapter;
    configDir: string;
    getName(): string;
    getRoot(): TFolder;
    getAbstractFileByPath(path: string): TAbstractFile | null;
    getFileByPath(path: string): TFile | null;
    getFolderByPath(path: string): TFolder | null;
    getFiles(): TFile[];
    getMarkdownFiles(): TFile[];
    getAllLoadedFiles(): TAbstractFile[];
    read(file: TFile): Promise<string>;
    cachedRead(file: TFile): Promise<string>;
    readBinary(file: TFile): Promise<ArrayBuffer>;
    create(path: string, data: string, options?: DataWriteOptions): Promise<TFile>;
    createBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile>;
    createFolder(path: string): Promise<TFolder>;
    modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;
    process(file: TFile, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;
    append(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;
    delete(file: TAbstractFile, force?: boolean): Promise<void>;
    trash(file: TAbstractFile, system: boolean): Promise<void>;
    rename(file: TAbstractFile, newPath: string): Promise<void>;
    copy<T extends TAbstractFile>(file: T, newPath: string): Promise<T>;
    getResourcePath(file: TFile): string;
    on(name: "create" | "delete" | "modify", callback: (file: TAbstractFile) => unknown, ctx?: unknown): EventRef;
    on(name: "rename", callback: (file: TAbstractFile, oldPath: string) => unknown, ctx?: unknown): EventRef;
    on(name: string, callback: (...data: never[]) => void, ctx?: unknown): EventRef;
    off(name: string, callback: (...data: never[]) => void): void;
    offref(ref: EventRef): void;
    trigger(name: string, ...data: unknown[]): void;
  }

  export interface FrontMatterCache {
    [key: string]: unknown;
  }

  export interface HeadingCache {
    heading: string;
    level: number;
    position: { start: { line: number; col: number; offset: number }; end: { line: number; col: number; offset: number } };
  }

  export interface LinkCache {
    link: string;
    original: string;
    displayText?: string;
  }

  export interface TagCache {
    tag: string;
  }

  export interface Pos {
    start: { line: number; col: number; offset: number };
    end: { line: number; col: number; offset: number };
  }

  export interface CachedMetadata {
    frontmatter?: FrontMatterCache;
    frontmatterPosition?: Pos;
    headings?: HeadingCache[];
    links?: LinkCache[];
    embeds?: LinkCache[];
    frontmatterLinks?: LinkCache[];
    tags?: TagCache[];
  }

  export class MetadataCache implements Events {
    resolvedLinks: Record<string, Record<string, number>>;
    unresolvedLinks: Record<string, Record<string, number>>;
    getFileCache(file: TFile): CachedMetadata | null;
    getCache(path: string): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
    fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string;
    on(name: "resolved", callback: () => unknown, ctx?: unknown): EventRef;
    on(name: "changed", callback: (file: TFile, data: string, cache: CachedMetadata) => unknown, ctx?: unknown): EventRef;
    on(name: string, callback: (...data: never[]) => void, ctx?: unknown): EventRef;
    off(name: string, callback: (...data: never[]) => void): void;
    offref(ref: EventRef): void;
    trigger(name: string, ...data: unknown[]): void;
  }

  export interface ViewState {
    type: string;
    state?: Record<string, unknown>;
    active?: boolean;
    pinned?: boolean;
    group?: WorkspaceLeaf;
  }

  export interface ViewStateResult {
    history?: boolean;
  }

  export interface OpenViewState {
    state?: Record<string, unknown>;
    eState?: Record<string, unknown>;
    active?: boolean;
    group?: WorkspaceLeaf;
  }

  export class WorkspaceLeaf extends Component {
    view: View;
    containerEl: HTMLElement;
    tabHeaderEl: HTMLElement;
    tabHeaderInnerTitleEl: HTMLElement;
    parent: unknown;
    getViewState(): ViewState;
    setViewState(viewState: ViewState, eState?: unknown): Promise<void>;
    openFile(file: TFile, openState?: OpenViewState): Promise<void>;
    setEphemeralState(state: unknown): void;
    getDisplayText(): string;
    detach(): void;
    setPinned(pinned: boolean): void;
    getRoot(): unknown;
    getContainer(): { win: Window; doc: Document };
    on(name: string, callback: (...data: never[]) => void, ctx?: unknown): EventRef;
  }

  export interface MarkdownFileInfo {
    app: App;
    editor?: Editor;
    file: TFile | null;
  }

  export class Workspace implements Events {
    containerEl: HTMLElement;
    activeLeaf: WorkspaceLeaf | null;
    activeEditor: MarkdownFileInfo | null;
    leftSplit: { collapsed: boolean; expand(): void; collapse(): void };
    rightSplit: { collapsed: boolean; expand(): void; collapse(): void };
    getActiveFile(): TFile | null;
    getActiveViewOfType<T extends View>(type: abstract new (...args: never[]) => T): T | null;
    getLeaf(newLeaf?: boolean | "split" | "tab" | "window", direction?: "vertical" | "horizontal"): WorkspaceLeaf;
    getLeftLeaf(split: boolean): WorkspaceLeaf | null;
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    getLeavesOfType(viewType: string): WorkspaceLeaf[];
    iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void;
    detachLeavesOfType(viewType: string): void;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    setActiveLeaf(leaf: WorkspaceLeaf, params?: { focus?: boolean }): void;
    openLinkText(linktext: string, sourcePath: string, newLeaf?: boolean | string, openViewState?: OpenViewState): Promise<void>;
    getLastOpenFiles(): string[];
    onLayoutReady(callback: () => unknown): void;
    requestSaveLayout: { cancel(): void };
    on(name: "active-leaf-change", callback: (leaf: WorkspaceLeaf | null) => unknown, ctx?: unknown): EventRef;
    on(name: "file-open", callback: (file: TFile | null) => unknown, ctx?: unknown): EventRef;
    on(name: "layout-change" | "quit" | "css-change", callback: () => unknown, ctx?: unknown): EventRef;
    on(
      name: "file-menu",
      callback: (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => unknown,
      ctx?: unknown,
    ): EventRef;
    on(
      name: "editor-menu",
      callback: (menu: Menu, editor: Editor, info: MarkdownView) => unknown,
      ctx?: unknown,
    ): EventRef;
    on(
      name: "editor-change",
      callback: (editor: Editor, info: MarkdownView) => unknown,
      ctx?: unknown,
    ): EventRef;
    on(name: string, callback: (...data: never[]) => void, ctx?: unknown): EventRef;
    off(name: string, callback: (...data: never[]) => void): void;
    offref(ref: EventRef): void;
    trigger(name: string, ...data: unknown[]): void;
  }

  export interface Command {
    id: string;
    name: string;
    icon?: string;
    callback?: () => unknown;
    checkCallback?: (checking: boolean) => boolean | void;
    editorCallback?: (editor: Editor, ctx: MarkdownView) => unknown;
    hotkeys?: { modifiers: string[]; key: string }[];
  }

  export interface EditorPosition {
    line: number;
    ch: number;
  }

  export interface EditorRange {
    from: EditorPosition;
    to: EditorPosition;
  }

  export class Editor {
    cm?: EditorView;
    getDoc(): Editor;
    getValue(): string;
    setValue(content: string): void;
    getLine(line: number): string;
    lineCount(): number;
    getSelection(): string;
    somethingSelected(): boolean;
    replaceSelection(replacement: string): void;
    replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void;
    getCursor(string?: "from" | "to" | "head" | "anchor"): EditorPosition;
    setCursor(pos: EditorPosition | number, ch?: number): void;
    setSelection(anchor: EditorPosition, head?: EditorPosition): void;
    listSelections(): { anchor: EditorPosition; head: EditorPosition }[];
    posToOffset(pos: EditorPosition): number;
    offsetToPos(offset: number): EditorPosition;
    focus(): void;
    refresh(): void;
  }

  export abstract class View extends Component {
    app: App;
    icon: string;
    navigation: boolean;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    scope: Scope;
    constructor(leaf: WorkspaceLeaf);
    abstract getViewType(): string;
    getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
    getState(): Record<string, unknown>;
    setState(state: unknown, result: ViewStateResult): Promise<void>;
    onResize(): void;
    onPaneMenu(menu: Menu, source: string): void;
  }

  export abstract class ItemView extends View {
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    addAction(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement;
  }

  export abstract class FileView extends ItemView {
    allowNoFile: boolean;
    file: TFile | null;
    onLoadFile(file: TFile): Promise<void>;
    onUnloadFile(file: TFile): Promise<void>;
  }

  export abstract class TextFileView extends FileView {
    data: string;
    requestSave: () => void;
    abstract getViewData(): string;
    abstract setViewData(data: string, clear: boolean): void;
    abstract clear(): void;
    save(clear?: boolean): Promise<void>;
  }

  export class MarkdownView extends TextFileView {
    editor: Editor;
    previewMode: { rerender(full?: boolean): void };
    currentMode: { type: string };
    getMode(): "source" | "preview";
    getViewType(): string;
    getViewData(): string;
    setViewData(data: string, clear: boolean): void;
    clear(): void;
  }

  export class Scope {
    register(modifiers: string[] | null, key: string | null, func: (evt: KeyboardEvent) => unknown): unknown;
    unregister(handler: unknown): void;
  }

  export class Keymap {
    static isModEvent(evt?: UserEvent | null): boolean | string;
  }

  export type UserEvent = MouseEvent | KeyboardEvent | TouchEvent | PointerEvent;

  export class Menu extends Component {
    addItem(cb: (item: MenuItem) => unknown): this;
    addSeparator(): this;
    setNoIcon(): this;
    showAtMouseEvent(evt: MouseEvent): this;
    showAtPosition(position: { x: number; y: number }, doc?: Document): this;
    hide(): this;
    onHide(callback: () => unknown): void;
  }

  export class MenuItem {
    setTitle(title: string | DocumentFragment): this;
    setIcon(icon: string | null): this;
    setChecked(checked: boolean | null): this;
    setDisabled(disabled: boolean): this;
    setWarning(warning: boolean): this;
    setIsLabel(isLabel: boolean): this;
    setSection(section: string): this;
    onClick(callback: (evt: MouseEvent | KeyboardEvent) => unknown): this;
  }

  export class Modal {
    app: App;
    scope: Scope;
    containerEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
    setTitle(title: string): this;
    setContent(content: string | DocumentFragment): this;
  }

  export abstract class SuggestModal<T> extends Modal {
    limit: number;
    emptyStateText: string;
    inputEl: HTMLInputElement;
    resultContainerEl: HTMLElement;
    constructor(app: App);
    setPlaceholder(placeholder: string): void;
    setInstructions(instructions: { command: string; purpose: string }[]): void;
    abstract getSuggestions(query: string): T[] | Promise<T[]>;
    abstract renderSuggestion(value: T, el: HTMLElement): void;
    abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
    onNoSuggestion(): void;
    selectActiveSuggestion(evt: MouseEvent | KeyboardEvent): void;
  }

  export interface FuzzyMatch<T> {
    item: T;
    match: SearchResult;
  }

  export interface SearchResult {
    score: number;
    matches: [number, number][];
  }

  export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
    abstract getItems(): T[];
    abstract getItemText(item: T): string;
    abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
    getSuggestions(query: string): FuzzyMatch<T>[];
    renderSuggestion(item: FuzzyMatch<T>, el: HTMLElement): void;
    onChooseSuggestion(item: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void;
  }

  export class Notice {
    noticeEl: HTMLElement;
    constructor(message: string | DocumentFragment, duration?: number);
    setMessage(message: string | DocumentFragment): this;
    hide(): void;
  }

  export class Setting {
    settingEl: HTMLElement;
    infoEl: HTMLElement;
    nameEl: HTMLElement;
    descEl: HTMLElement;
    controlEl: HTMLElement;
    components: unknown[];
    constructor(containerEl: HTMLElement);
    setName(name: string | DocumentFragment): this;
    setDesc(desc: string | DocumentFragment): this;
    setClass(cls: string): this;
    setTooltip(tooltip: string): this;
    setHeading(): this;
    setDisabled(disabled: boolean): this;
    addButton(cb: (component: ButtonComponent) => unknown): this;
    addExtraButton(cb: (component: ExtraButtonComponent) => unknown): this;
    addToggle(cb: (component: ToggleComponent) => unknown): this;
    addText(cb: (component: TextComponent) => unknown): this;
    addTextArea(cb: (component: TextAreaComponent) => unknown): this;
    addDropdown(cb: (component: DropdownComponent) => unknown): this;
    addSlider(cb: (component: SliderComponent) => unknown): this;
    then(cb: (setting: this) => unknown): this;
  }

  export abstract class BaseComponent {
    disabled: boolean;
    setDisabled(disabled: boolean): this;
    then(cb: (component: this) => unknown): this;
  }

  export abstract class ValueComponent<T> extends BaseComponent {
    getValue(): T;
    setValue(value: T): this;
    registerOptionListener(listeners: Record<string, (value?: T) => T>, key: string): this;
  }

  export class ButtonComponent extends BaseComponent {
    buttonEl: HTMLButtonElement;
    setCta(): this;
    removeCta(): this;
    setWarning(): this;
    setButtonText(name: string): this;
    setIcon(icon: string): this;
    setTooltip(tooltip: string): this;
    setClass(cls: string): this;
    onClick(callback: (evt: MouseEvent) => unknown): this;
  }

  export class ExtraButtonComponent extends BaseComponent {
    extraSettingsEl: HTMLElement;
    setIcon(icon: string): this;
    setTooltip(tooltip: string): this;
    onClick(callback: () => unknown): this;
  }

  export class ToggleComponent extends ValueComponent<boolean> {
    toggleEl: HTMLElement;
    setTooltip(tooltip: string): this;
    onChange(callback: (value: boolean) => unknown): this;
  }

  export class TextComponent extends ValueComponent<string> {
    inputEl: HTMLInputElement;
    setPlaceholder(placeholder: string): this;
    onChange(callback: (value: string) => unknown): this;
  }

  export class TextAreaComponent extends ValueComponent<string> {
    inputEl: HTMLTextAreaElement;
    setPlaceholder(placeholder: string): this;
    onChange(callback: (value: string) => unknown): this;
  }

  export class DropdownComponent extends ValueComponent<string> {
    selectEl: HTMLSelectElement;
    addOption(value: string, display: string): this;
    addOptions(options: Record<string, string>): this;
    onChange(callback: (value: string) => unknown): this;
  }

  export class SliderComponent extends ValueComponent<number> {
    sliderEl: HTMLInputElement;
    setLimits(min: number, max: number, step: number | "any"): this;
    setDynamicTooltip(): this;
    onChange(callback: (value: number) => unknown): this;
  }

  // Declarative settings (@since 1.13.0). A tab returns its rows as data so Obsidian can render
  // them and index them for settings search. `src/settings/types.ts` models the subset this
  // plugin uses; these are the shapes that subset has to fit through.

  export interface SettingDefinitionBase {
    name: string;
    desc?: string | DocumentFragment;
    /** Search-only synonyms; never rendered. */
    aliases?: string[];
    searchable?: boolean | (() => boolean);
    visible?: boolean | (() => boolean);
  }

  export interface SettingControlBase<V> {
    /** Passed to getControlValue/setControlValue on the tab. */
    key: string;
    defaultValue?: V;
    validate?: (value: V) => string | void | Promise<string | void>;
    disabled?: boolean | (() => boolean);
  }

  export interface SettingToggleControl extends SettingControlBase<boolean> {
    type: "toggle";
  }

  export interface SettingDefinitionControl extends SettingDefinitionBase {
    control: SettingToggleControl;
    action?: never;
    render?: never;
  }

  export interface SettingDefinitionRender extends SettingDefinitionBase {
    // Obsidian also passes the enclosing SettingGroup, which this plugin does not use.
    render: (setting: Setting) => void | (() => void);
    control?: never;
    action?: never;
  }

  export interface SettingDefinitionAction extends SettingDefinitionBase {
    action: (el: HTMLElement, index: number) => void;
    disabled?: boolean | (() => boolean);
    control?: never;
    render?: never;
  }

  export interface SettingDefinitionEmpty extends SettingDefinitionBase {
    control?: never;
    render?: never;
    action?: never;
  }

  export type SettingDefinition =
    | SettingDefinitionControl
    | SettingDefinitionRender
    | SettingDefinitionAction
    | SettingDefinitionEmpty;

  export interface SettingDefinitionGroup {
    type: "group" | "list";
    heading?: string;
    cls?: string;
    items?: SettingDefinition[];
    visible?: boolean | (() => boolean);
  }

  export type SettingDefinitionItem = SettingDefinition | SettingDefinitionGroup;

  export abstract class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    /** @since 1.13.0 — a non-empty return replaces display(). */
    getSettingDefinitions(): SettingDefinitionItem[];
    /** @since 1.13.0 — rebuilds the definitions and repaints the open tab. */
    update(): void;
    getControlValue(key: string): unknown;
    setControlValue(key: string, value: unknown): void | Promise<void>;
    display(): void;
    hide(): void;
  }

  export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion: string;
    description: string;
    author: string;
    authorUrl?: string;
    fundingUrl?: string;
    isDesktopOnly?: boolean;
    dir?: string;
  }

  export abstract class Plugin extends Component {
    app: App;
    manifest: PluginManifest;
    constructor(app: App, manifest: PluginManifest);
    onload(): Promise<void> | void;
    onunload(): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement;
    addStatusBarItem(): HTMLElement;
    addCommand(command: Command): Command;
    removeCommand(commandId: string): void;
    addSettingTab(settingTab: PluginSettingTab): void;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => View): void;
    registerExtensions(extensions: string[], viewType: string): void;
    registerHoverLinkSource(id: string, info: { display: string; defaultMod: boolean }): void;
    registerMarkdownPostProcessor(postProcessor: (el: HTMLElement, ctx: unknown) => unknown, sortOrder?: number): unknown;
    registerEditorExtension(extension: Extension): void;
    registerObsidianProtocolHandler(action: string, handler: (params: Record<string, string>) => unknown): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
  }

  export class App {
    workspace: Workspace;
    vault: Vault;
    metadataCache: MetadataCache;
    fileManager: FileManager;
    keymap: Keymap;
    scope: Scope;
    lastEvent: UserEvent | null;
  }

  export class FileManager {
    getNewFileParent(sourcePath: string, newFilePath?: string): TFolder;
    renameFile(file: TAbstractFile, newPath: string): Promise<void>;
    trashFile(file: TAbstractFile): Promise<void>;
    generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string;
    processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void, options?: DataWriteOptions): Promise<void>;
  }

  export interface RequestUrlParam {
    url: string;
    method?: string;
    contentType?: string;
    body?: string | ArrayBuffer;
    headers?: Record<string, string>;
    throw?: boolean;
  }

  export interface RequestUrlResponse {
    status: number;
    headers: Record<string, string>;
    arrayBuffer: ArrayBuffer;
    json: unknown;
    text: string;
  }

  export interface RequestUrlResponsePromise extends Promise<RequestUrlResponse> {
    arrayBuffer: Promise<ArrayBuffer>;
    json: Promise<unknown>;
    text: Promise<string>;
  }

  export function requestUrl(request: RequestUrlParam | string): RequestUrlResponsePromise;
  export function normalizePath(path: string): string;
  export function getLinkpath(linktext: string): string;
  export function setIcon(parent: HTMLElement, iconId: string): void;
  export function parseYaml(yaml: string): unknown;
  export function stringifyYaml(obj: unknown): string;
  export function prepareSimpleSearch(query: string): (text: string) => SearchResult | null;
  export function prepareFuzzySearch(query: string): (text: string) => SearchResult | null;
  export function debounce<T extends unknown[], V>(
    cb: (...args: [...T]) => V,
    timeout?: number,
    resetTimer?: boolean,
  ): ((...args: [...T]) => void) & { cancel(): void; run(): V | void };
  export function moment(input?: string | number | Date): MomentLike;

  export interface MomentLike {
    format(fmt?: string): string;
    valueOf(): number;
    toDate(): Date;
    fromNow(): string;
    isValid(): boolean;
  }

  export const Platform: {
    isDesktop: boolean;
    isMobile: boolean;
    isDesktopApp: boolean;
    isMobileApp: boolean;
    isMacOS: boolean;
    isWin: boolean;
    isLinux: boolean;
  };
}
