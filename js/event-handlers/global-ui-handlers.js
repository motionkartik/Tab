export const initGlobalUiHandlers = () => {
  document.addEventListener("click", () => {
    document.querySelectorAll(".link-overflow-popover.open, .group-menu-popover.open").forEach(el => el.remove());
  });
};
