import { zh } from './zh';
import { en } from './en';
import { zhTW } from './zh-TW';
import { ja } from './ja';
import { ko } from './ko';
import type { Locale } from '../locale';
import type { Messages } from '../types';

export const messages: Record<Locale, Messages> = { zh, en, 'zh-TW': zhTW, ja, ko };
export { zh, en, zhTW, ja, ko };
