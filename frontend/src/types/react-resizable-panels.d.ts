declare module "react-resizable-panels" {
  import type * as React from "react";

  export type Orientation = "horizontal" | "vertical";

  export interface GroupProps extends React.ComponentPropsWithoutRef<"div"> {
    id?: string;
    orientation?: Orientation;
    defaultLayout?: Record<string, number>;
    disabled?: boolean;
    onLayoutChange?: (layout: Record<string, number>) => void;
    onLayoutChanged?: (layout: Record<string, number>) => void;
  }

  export interface PanelProps extends React.ComponentPropsWithoutRef<"div"> {
    id?: string;
    defaultSize?: number | string;
    minSize?: number | string;
    maxSize?: number | string;
    collapsedSize?: number | string;
    collapsible?: boolean;
    disabled?: boolean;
    onResize?: (size: { asPercentage: number; inPixels: number }) => void;
  }

  export interface SeparatorProps extends React.ComponentPropsWithoutRef<"div"> {
    id?: string;
    disabled?: boolean;
  }

  export const Group: React.ComponentType<GroupProps>;
  export const Panel: React.ComponentType<PanelProps>;
  export const Separator: React.ComponentType<SeparatorProps>;
}
