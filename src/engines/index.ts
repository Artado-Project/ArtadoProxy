import type { Engine } from './engine.js';
import { duckduckgo } from './duckduckgo.js';
import { brave } from './brave.js';
import { startpage } from './startpage.js';
import { qwant } from './qwant.js';
import { mojeek } from './mojeek.js';
import { ask } from './ask.js';
import { marginalia } from './marginalia.js';

export const engines: Engine[] = [
  duckduckgo,
  brave,
  startpage,
  qwant,
  mojeek,
  ask,
  marginalia
];
