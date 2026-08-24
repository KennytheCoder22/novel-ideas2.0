export type HostedLibraryManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  orientation: "portrait-primary";
  background_color: string;
  theme_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: "image/png";
    purpose: "any" | "maskable";
  }>;
};

export function libraryPwaThemeColor(config: Record<string, unknown>): string;
export function libraryPwaName(config: Record<string, unknown>, libraryId: string): string;
export function libraryPwaShortName(config: Record<string, unknown>, libraryId: string): string;
export function readLibraryLogoBuffer(config: Record<string, unknown>): Buffer | null;
export function libraryPwaIconVersion(config: Record<string, unknown>, logoBuffer: Buffer | null): string;
export function buildHostedLibraryManifest(
  config: Record<string, unknown>,
  libraryId: string,
  options?: { hasCustomIcon?: boolean; iconVersion?: string },
): HostedLibraryManifest;
export function fallbackPwaIconPath(size: number, purpose: "any" | "maskable"): string;
export function libraryPwaLogoIsUsable(logoBuffer: Buffer | null): Promise<boolean>;
export function renderLibraryPwaIcon(
  logoBuffer: Buffer,
  size: 180 | 192 | 512,
  purpose: "any" | "maskable",
  background: string,
): Promise<Buffer>;
