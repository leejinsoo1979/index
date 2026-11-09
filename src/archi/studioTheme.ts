/**
 * Agent Studio follows the product-wide light/dark setting (src/lib/theme.ts). The value is mirrored
 * on <html data-studio-theme> so dialogs portalled into <body> follow it too; the light token set is
 * in design-tokens.css.
 */
import { getTheme, setTheme, useTheme, type ThemeMode } from '../lib/theme';

export type StudioTheme = ThemeMode;
export const getStudioTheme = getTheme;
export const setStudioTheme = setTheme;
export const useStudioTheme = useTheme;
