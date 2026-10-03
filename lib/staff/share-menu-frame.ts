const SHARE_MENU_MARGIN_PX = 8;
const SHARE_MENU_GAP_PX = 6;
const SHARE_MENU_MIN_WIDTH_PX = 272;

export function shareMenuPanelPosition(input: {
  viewportWidth: number;
  viewportHeight: number;
  buttonTop: number;
  buttonRight: number;
  buttonBottom: number;
  panelWidth: number;
  panelHeight: number;
}): { top: number; left: number; width: number } {
  const width = Math.max(input.panelWidth, SHARE_MENU_MIN_WIDTH_PX);
  const left = Math.min(
    Math.max(SHARE_MENU_MARGIN_PX, input.buttonRight - width),
    Math.max(
      SHARE_MENU_MARGIN_PX,
      input.viewportWidth - width - SHARE_MENU_MARGIN_PX
    )
  );
  const belowTop = input.buttonBottom + SHARE_MENU_GAP_PX;
  const aboveTop = input.buttonTop - input.panelHeight - SHARE_MENU_GAP_PX;
  const fitsBelow =
    belowTop + input.panelHeight <= input.viewportHeight - SHARE_MENU_MARGIN_PX;
  const fitsAbove = aboveTop >= SHARE_MENU_MARGIN_PX;
  const top =
    !fitsBelow && fitsAbove
      ? aboveTop
      : Math.max(SHARE_MENU_MARGIN_PX, belowTop);
  return { top, left, width };
}
