# Self-hosted font files

These WOFF2 files are the latin subsets River Aftercare already served through `next/font/google`. Production builds load them with `next/font/local` so compile time does not fetch `fonts.googleapis.com` or `fonts.gstatic.com`.

Each file was checked against the latin `src` URL in the Google Fonts CSS response for the same family, weights, and `display=swap` (user agent that requests WOFF2). The bytes matched.

| File                      | Family     | Weights          | Style  | Source file                              |
| ------------------------- | ---------- | ---------------- | ------ | ---------------------------------------- |
| `geist-latin.woff2`       | Geist      | 100–900 variable | normal | `fonts.gstatic.com` Geist v5 latin       |
| `geist-mono-latin.woff2`  | Geist Mono | 100–900 variable | normal | `fonts.gstatic.com` Geist Mono v6 latin  |
| `open-sans-latin.woff2`   | Open Sans  | 400–700 variable | normal | `fonts.gstatic.com` Open Sans v44 latin  |
| `roboto-latin.woff2`      | Roboto     | 400–700 variable | normal | `fonts.gstatic.com` Roboto v51 latin     |
| `montserrat-latin.woff2`  | Montserrat | 400–700 variable | normal | `fonts.gstatic.com` Montserrat v31 latin |
| `inter-latin.woff2`       | Inter      | 400–700 variable | normal | `fonts.gstatic.com` Inter v20 latin      |
| `lato-latin-400.woff2`    | Lato       | 400              | normal | `fonts.gstatic.com` Lato v25 latin       |
| `lato-latin-700.woff2`    | Lato       | 700              | normal | `fonts.gstatic.com` Lato v25 latin       |
| `poppins-latin-400.woff2` | Poppins    | 400              | normal | `fonts.gstatic.com` Poppins v24 latin    |
| `poppins-latin-600.woff2` | Poppins    | 600              | normal | `fonts.gstatic.com` Poppins v24 latin    |
| `poppins-latin-700.woff2` | Poppins    | 700              | normal | `fonts.gstatic.com` Poppins v24 latin    |

Italic files are not included. The previous `next/font/google` calls used the default normal style only.

Open Sans and Roboto are width-axis variable fonts. Their loaders set `font-stretch: 100%`, which is the normal width the previous Google CSS declared.

## Licenses

Redistribution with the copyright notice and license is permitted. License texts are in `licenses/`.

| Family            | License     | Copyright                                                                 |
| ----------------- | ----------- | ------------------------------------------------------------------------- |
| Geist, Geist Mono | SIL OFL 1.1 | Copyright 2024 The Geist Project Authors                                  |
| Open Sans         | SIL OFL 1.1 | Copyright 2020 The Open Sans Project Authors                              |
| Roboto            | SIL OFL 1.1 | Copyright 2011 The Roboto Project Authors                                 |
| Montserrat        | SIL OFL 1.1 | Copyright 2024 The Montserrat.Git Project Authors                         |
| Lato              | SIL OFL 1.1 | Copyright (c) 2010-2014 by tyPoland Lukasz Dziedzic, reserved name “Lato” |
| Poppins           | SIL OFL 1.1 | Copyright 2020 The Poppins Project Authors                                |
| Inter             | SIL OFL 1.1 | Copyright 2020 The Inter Project Authors                                  |

Upstream license files were copied from the [google/fonts](https://github.com/google/fonts) repository (`ofl/<family>/OFL.txt`).
