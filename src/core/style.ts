/** Visual styles shared by the drawing tools and the renderer. */
export type LineStyle = "single" | "double" | "dashed";
export type ArrowStyle = "solid" | "open" | "ascii";
export type BoxShape = "rect" | "round" | "double" | "diamond" | "ellipse" | "cylinder";
export type TextMode = "inplace" | "layer";

export interface DrawStyle {
  line: LineStyle;
  arrow: ArrowStyle;
  box: BoxShape;
}

export const DEFAULT_DRAW_STYLE: DrawStyle = { line: "single", arrow: "solid", box: "rect" };
