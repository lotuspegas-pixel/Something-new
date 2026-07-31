/* Colour themes — plain ES5.
   Each theme is a flat set of CSS custom properties applied to <html>, so a
   single object here is the only place a colour scheme is defined.

   Designed for colour e-ink (Kaleido-type) panels: those put a colour filter
   over a greyscale panel, which washes saturation out by roughly two thirds.
   So every theme uses reasonably saturated source colours, and — more
   importantly — keeps a real *luminance* gap between light and dark squares,
   so the board still reads correctly on a plain black-and-white e-reader. */

(function (root) {
  'use strict';

  var THEMES = [
    {
      id: 'bos',
      name: 'Bos',
      note: 'Klassiek groen, zoals een toernooibord',
      vars: {
        '--board-light': '#eeeed2', '--board-dark': '#769656',
        '--piece-white': '#ffffff', '--piece-black': '#2e2e2e',
        '--piece-outline': '#1a1a1a', '--piece-detail': '#ffffff',
        '--page-bg': '#faf9f0', '--page-fg': '#1c1c1c', '--panel-bg': '#ffffff',
        '--border': '#3d4f2e', '--accent': '#4a6b35', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#c9d16a', '--hl-selected': '#f2f26a',
        '--hl-check': '#d64a3a', '--hl-dot': '#3a4a2a', '--coord': '#5a6b45'
      }
    },
    {
      id: 'hout',
      name: 'Hout',
      note: 'Warme houtkleuren van een echt schaakbord',
      vars: {
        '--board-light': '#f0d9b5', '--board-dark': '#b58863',
        '--piece-white': '#fffdf7', '--piece-black': '#3a2a1c',
        '--piece-outline': '#2a1c10', '--piece-detail': '#f5e6d0',
        '--page-bg': '#fbf3e6', '--page-fg': '#2a1f14', '--panel-bg': '#fffaf0',
        '--border': '#6b4a2f', '--accent': '#8a5a35', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#dbc27a', '--hl-selected': '#f0d060',
        '--hl-check': '#c0392b', '--hl-dot': '#4a3520', '--coord': '#7a5a3a'
      }
    },
    {
      id: 'oceaan',
      name: 'Oceaan',
      note: 'Koel blauw, rustig voor lange partijen',
      vars: {
        '--board-light': '#dee3e6', '--board-dark': '#4b7399',
        '--piece-white': '#ffffff', '--piece-black': '#22303c',
        '--piece-outline': '#10202c', '--piece-detail': '#e8f0f5',
        '--page-bg': '#f2f6f8', '--page-fg': '#16242e', '--panel-bg': '#ffffff',
        '--border': '#2e5273', '--accent': '#356089', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#9fc0d8', '--hl-selected': '#e8d95a',
        '--hl-check': '#c0392b', '--hl-dot': '#1f3a52', '--coord': '#456b8c'
      }
    },
    {
      id: 'koraal',
      name: 'Koraal',
      note: 'Warm terracotta met roomwit',
      vars: {
        '--board-light': '#f7e2d4', '--board-dark': '#c8705c',
        '--piece-white': '#fffaf6', '--piece-black': '#3a2018',
        '--piece-outline': '#28140e', '--piece-detail': '#ffeadf',
        '--page-bg': '#fdf4ef', '--page-fg': '#2e1810', '--panel-bg': '#fffbf8',
        '--border': '#8f4634', '--accent': '#b05540', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#e8b49f', '--hl-selected': '#f0c94a',
        '--hl-check': '#8f1d10', '--hl-dot': '#5a2a1c', '--coord': '#95553f'
      }
    },
    {
      id: 'lavendel',
      name: 'Lavendel',
      note: 'Zacht paars, laag contrast maar elegant',
      vars: {
        '--board-light': '#e9e2f2', '--board-dark': '#8878b0',
        '--piece-white': '#fffdff', '--piece-black': '#2b2338',
        '--piece-outline': '#1c1526', '--piece-detail': '#efe8f7',
        '--page-bg': '#f7f4fb', '--page-fg': '#241c30', '--panel-bg': '#ffffff',
        '--border': '#5a4a7a', '--accent': '#6d5a94', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#c4b4dd', '--hl-selected': '#ecd45c',
        '--hl-check': '#b83c50', '--hl-dot': '#3d3155', '--coord': '#6f5f92'
      }
    },
    {
      id: 'munt',
      name: 'Munt',
      note: 'Fris mintgroen met diep petrol',
      vars: {
        '--board-light': '#dceee6', '--board-dark': '#4f8f7d',
        '--piece-white': '#ffffff', '--piece-black': '#1d2f2a',
        '--piece-outline': '#0f1f1a', '--piece-detail': '#e2f2ec',
        '--page-bg': '#f1f9f5', '--page-fg': '#12241f', '--panel-bg': '#ffffff',
        '--border': '#2f6355', '--accent': '#3d7767', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#a5cfc0', '--hl-selected': '#e8cf55',
        '--hl-check': '#c0392b', '--hl-dot': '#1f4438', '--coord': '#448270'
      }
    },
    {
      id: 'zonsondergang',
      name: 'Zonsondergang',
      note: 'Amber en oranje, veel warmte',
      vars: {
        '--board-light': '#f9e6c4', '--board-dark': '#c98a3c',
        '--piece-white': '#fffcf2', '--piece-black': '#3d2a12',
        '--piece-outline': '#2a1c0a', '--piece-detail': '#ffeed2',
        '--page-bg': '#fdf6e8', '--page-fg': '#2e2010', '--panel-bg': '#fffbf2',
        '--border': '#8c5c1e', '--accent': '#a86f28', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#e8c485', '--hl-selected': '#f5d43e',
        '--hl-check': '#b02a1a', '--hl-dot': '#5a3c14', '--coord': '#96682c'
      }
    },
    {
      id: 'papier',
      name: 'Papier',
      note: 'Sepia, alsof het uit een oud schaakboek komt',
      vars: {
        '--board-light': '#f4ecd8', '--board-dark': '#bfa87e',
        '--piece-white': '#fffdf6', '--piece-black': '#3a3020',
        '--piece-outline': '#2a2216', '--piece-detail': '#f5efdf',
        '--page-bg': '#faf5e9', '--page-fg': '#2e2618', '--panel-bg': '#fffcf4',
        '--border': '#7a6a4a', '--accent': '#6f6044', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#dfd0aa', '--hl-selected': '#e6cf70',
        '--hl-check': '#a03828', '--hl-dot': '#4a4030', '--coord': '#8a785a'
      }
    },
    {
      id: 'grafiet',
      name: 'Grafiet',
      note: 'Grijstinten — de beste keuze voor zwart-wit e-ink',
      vars: {
        '--board-light': '#e9e9e9', '--board-dark': '#8f8f8f',
        '--piece-white': '#ffffff', '--piece-black': '#242424',
        '--piece-outline': '#111111', '--piece-detail': '#f0f0f0',
        '--page-bg': '#ffffff', '--page-fg': '#111111', '--panel-bg': '#ffffff',
        '--border': '#333333', '--accent': '#3a3a3a', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#bdbdbd', '--hl-selected': '#6e6e6e',
        '--hl-check': '#000000', '--hl-dot': '#2a2a2a', '--coord': '#666666'
      }
    },
    {
      id: 'nacht',
      name: 'Nacht',
      note: 'Donker thema voor e-readers met frontlicht',
      vars: {
        '--board-light': '#7a7a7a', '--board-dark': '#4a4a4a',
        '--piece-white': '#f4f4f4', '--piece-black': '#1a1a1a',
        // A mid-grey outline is the one value that stays visible against both
        // the light and the dark squares in this scheme.
        '--piece-outline': '#a8a8a8', '--piece-detail': '#d8d8d8',
        '--page-bg': '#1c1c1c', '--page-fg': '#e8e8e8', '--panel-bg': '#282828',
        '--border': '#5a5a5a', '--accent': '#6a6a6a', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#8d8d5a', '--hl-selected': '#c9b44a',
        '--hl-check': '#c0392b', '--hl-dot': '#e0e0e0', '--coord': '#b0b0b0'
      }
    },
    {
      id: 'contrast',
      name: 'Hoog contrast',
      note: 'Maximaal verschil, voor slecht zicht of oude schermen',
      vars: {
        '--board-light': '#ffffff', '--board-dark': '#6b6b6b',
        '--piece-white': '#ffffff', '--piece-black': '#000000',
        '--piece-outline': '#000000', '--piece-detail': '#ffffff',
        '--page-bg': '#ffffff', '--page-fg': '#000000', '--panel-bg': '#ffffff',
        '--border': '#000000', '--accent': '#000000', '--accent-fg': '#ffffff',
        '--hl-lastmove': '#c0c0c0', '--hl-selected': '#000000',
        '--hl-check': '#000000', '--hl-dot': '#000000', '--coord': '#000000'
      }
    }
  ];

  function byId(id) {
    for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].id === id) return THEMES[i]; }
    return THEMES[0];
  }

  function apply(id) {
    var theme = byId(id);
    var rootEl = document.documentElement;
    for (var key in theme.vars) {
      if (theme.vars.hasOwnProperty(key)) rootEl.style.setProperty(key, theme.vars[key]);
    }
    rootEl.setAttribute('data-theme', theme.id);
    return theme;
  }

  root.Themes = { list: THEMES, byId: byId, apply: apply };
}(typeof self !== 'undefined' ? self : this));
