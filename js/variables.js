// State management with getters and setters
const state = {
    elements: [],
    currentRow: 0,
    currentGroup: "",
    linkMode: "new",
    linkIndex: 0,
};

// DOM elements
export let groupBackdrop = document.getElementById("group");
export let linkBackdrop = document.getElementById("link");
export let addGroupButton = document.querySelector("#add-group");
export let addLinkButton = document.querySelector("#add-link");
export let groupCloseButton = document.querySelector("#group-close");
export let linkCloseButton = document.querySelector("#link-close");
export let groupInput = document.querySelector("#group-input");
export let linkInput = document.querySelector("#linkInput");
export let urlInput = document.querySelector("#url");
export let svgInput = document.querySelector("#svg");
export let colors = document.querySelectorAll(".color");
export let iconContainerAddLink = document.querySelector(".icon-container");
// Scoped to the link drawer: #group (which also has a .choosen-icon,
// #group-chosen-icon) precedes #link in the DOM, so an unscoped query would
// grab the group drawer's preview and paint/reset the wrong drawer.
export let choosenIconAddLink = document.querySelector("#link .choosen-icon");
export let alreadyInUseIconsAddLink = document.querySelector(
    ".icon-container-in-use",
);
export let container = document.querySelector(".container");

// Settings modal elements
export let settingsBtn = document.getElementById("settings-btn");
export let settingsModal = document.getElementById("settings-modal");
export let settingsClose = document.getElementById("settings-close");
export let settingsTabs = document.querySelectorAll(".settings-tab");
export let settingsPanels = document.querySelectorAll(".settings-panel");
export let gradientOptions = document.querySelectorAll(".gradient-option");
export let settingsBgImageInput = document.getElementById(
    "settings-bg-image-input",
);
export let settingsUploadImage = document.getElementById(
    "settings-upload-image",
);

// General settings elements
export let linkTargetSelect = document.getElementById("link-target-select");

// Reset buttons
export let resetBackgroundBtn = document.getElementById("reset-background");
export let resetLayoutBtn = document.getElementById("reset-layout");

// Theme selector
export let uiStyleSelect = document.getElementById("ui-style-select");

// Data management
export let exportDataBtn = document.getElementById("export-data-btn");
export let importDataBtn = document.getElementById("import-data-btn");
export let importDataInput = document.getElementById("import-data-input");

// Item type selector in link modal
export let itemTypeSelect = document.getElementById("item-type");
export let linkUrlFields = document.getElementById("link-url-fields");
export let linkIconFields = document.getElementById("link-icon-fields");

export const refreshDomElements = () => {
    groupBackdrop = document.getElementById("group");
    linkBackdrop = document.getElementById("link");
    addGroupButton = document.querySelector("#add-group");
    addLinkButton = document.querySelector("#add-link");
    groupCloseButton = document.querySelector("#group-close");
    linkCloseButton = document.querySelector("#link-close");
    groupInput = document.querySelector("#group-input");
    linkInput = document.querySelector("#linkInput");
    urlInput = document.querySelector("#url");
    svgInput = document.querySelector("#svg");
    colors = document.querySelectorAll(".color");
    iconContainerAddLink = document.querySelector(".icon-container");
    choosenIconAddLink = document.querySelector("#link .choosen-icon");
    alreadyInUseIconsAddLink = document.querySelector(".icon-container-in-use");
    container = document.querySelector(".container");

    // Settings modal elements
    settingsBtn = document.getElementById("settings-btn");
    settingsModal = document.getElementById("settings-modal");
    settingsClose = document.getElementById("settings-close");
    settingsTabs = document.querySelectorAll(".settings-tab");
    settingsPanels = document.querySelectorAll(".settings-panel");
    gradientOptions = document.querySelectorAll(".gradient-option");
    settingsBgImageInput = document.getElementById("settings-bg-image-input");
    settingsUploadImage = document.getElementById("settings-upload-image");

    // General settings elements
    linkTargetSelect = document.getElementById("link-target-select");

    // Reset buttons
    resetBackgroundBtn = document.getElementById("reset-background");
    resetLayoutBtn = document.getElementById("reset-layout");

    // Theme selector
    uiStyleSelect = document.getElementById("ui-style-select");

    // Data management
    exportDataBtn = document.getElementById("export-data-btn");
    importDataBtn = document.getElementById("import-data-btn");
    importDataInput = document.getElementById("import-data-input");

    // Item type selector
    itemTypeSelect = document.getElementById("item-type");
    linkUrlFields = document.getElementById("link-url-fields");
    linkIconFields = document.getElementById("link-icon-fields");
};

// Getters
export const getElements = () => state.elements;
export const getCurrentRow = () => state.currentRow;
export const getCurrentGroup = () => state.currentGroup;
export const getLinkMode = () => state.linkMode;
export const getLinkIndex = () => state.linkIndex;

// Setters
export const setElements = (value) => {
    state.elements = value;
};
export const setCurrentRow = (value) => {
    state.currentRow = value;
};
export const setCurrentGroup = (value) => {
    state.currentGroup = value;
};
export const setLinkMode = (value) => {
    state.linkMode = value;
};
export const setLinkIndex = (value) => {
    state.linkIndex = value;
};
