/** `next/font/google` stand-in: the fonts are loaded by the host app's CSS. */
type FontOptions = {
  weight?: string | string[];
  subsets?: string[];
  display?: string;
  variable?: string;
  preload?: boolean;
};
type FontResult = { className: string; style: { fontFamily: string }; variable: string };

function font(family: string, className: string) {
  return (_options?: FontOptions): FontResult => ({
    className,
    style: { fontFamily: `'${family}', sans-serif` },
    variable: className,
  });
}

export const Black_Han_Sans = font('Black Han Sans', 'archi-font-display');
