import emojiByGroupRaw from 'unicode-emoji-json/data-by-group.json';

export interface EmojiCatalogItem {
  emoji: string;
  name: string;
  slug: string;
}

export interface EmojiCatalogGroup {
  id: string;
  label: string;
  emojis: EmojiCatalogItem[];
}

interface RawGroup {
  name: string;
  slug: string;
  emojis: Array<{
    emoji: string;
    name: string;
    slug: string;
  }>;
}

const POPULAR_EMOJIS: EmojiCatalogItem[] = [
  { emoji: '🗿', name: 'moai stone face', slug: 'moai' },
  { emoji: '💀', name: 'skull dead', slug: 'skull' },
  { emoji: '😂', name: 'face with tears of joy', slug: 'face_with_tears_of_joy' },
  { emoji: '😭', name: 'loudly crying face', slug: 'loudly_crying_face' },
  { emoji: '❤️', name: 'red heart love', slug: 'red_heart' },
  { emoji: '🔥', name: 'fire lit', slug: 'fire' },
  { emoji: '🫶', name: 'heart hands', slug: 'heart_hands' },
  { emoji: '🫡', name: 'saluting face', slug: 'saluting_face' },
  { emoji: '🫠', name: 'melting face', slug: 'melting_face' },
  { emoji: '🥹', name: 'face holding back tears', slug: 'face_holding_back_tears' },
  { emoji: '😎', name: 'smiling face with sunglasses', slug: 'smiling_face_with_sunglasses' },
  { emoji: '🤯', name: 'exploding head', slug: 'exploding_head' },
  { emoji: '🤡', name: 'clown face', slug: 'clown_face' },
  { emoji: '👀', name: 'eyes', slug: 'eyes' },
  { emoji: '👍', name: 'thumbs up', slug: 'thumbs_up' },
  { emoji: '🙏', name: 'folded hands pray', slug: 'folded_hands' },
  { emoji: '🙌', name: 'raising hands', slug: 'raising_hands' },
  { emoji: '🤌', name: 'pinched fingers', slug: 'pinched_fingers' },
  { emoji: '✨', name: 'sparkles', slug: 'sparkles' },
  { emoji: '💯', name: 'hundred points', slug: 'hundred_points' },
  { emoji: '🎉', name: 'party popper', slug: 'party_popper' },
  { emoji: '🛵', name: 'motor scooter', slug: 'motor_scooter' },
  { emoji: '🚆', name: 'train', slug: 'train' },
  { emoji: '☕', name: 'hot beverage coffee', slug: 'hot_beverage' },
  { emoji: '🍜', name: 'steaming bowl noodle', slug: 'steaming_bowl' },
  { emoji: '📸', name: 'camera with flash', slug: 'camera_with_flash' },
];

const SHORT_GROUP_LABELS: Record<string, string> = {
  'Smileys & Emotion': 'Smileys',
  'People & Body': 'People',
  'Animals & Nature': 'Nature',
  'Food & Drink': 'Food',
  'Travel & Places': 'Travel',
  Activities: 'Activity',
  Objects: 'Objects',
  Symbols: 'Symbols',
  Flags: 'Flags',
};

const rawGroups = emojiByGroupRaw as RawGroup[];

export const FULL_EMOJI_GROUPS: readonly EmojiCatalogGroup[] = [
  {
    id: 'popular',
    label: 'Popular',
    emojis: POPULAR_EMOJIS,
  },
  ...rawGroups.map((g) => ({
    id: g.slug,
    label: SHORT_GROUP_LABELS[g.name] ?? g.name,
    emojis: g.emojis.map((e) => ({
      emoji: e.emoji,
      name: e.name.toLowerCase(),
      slug: e.slug,
    })),
  })),
];

const ALL_UNIQUE_EMOJIS: EmojiCatalogItem[] = (() => {
  const seen = new Set<string>();
  const list: EmojiCatalogItem[] = [];
  for (const g of FULL_EMOJI_GROUPS) {
    for (const item of g.emojis) {
      if (!seen.has(item.emoji)) {
        seen.add(item.emoji);
        list.push(item);
      }
    }
  }
  return list;
})();

const EMOJI_ID_ALIASES: Record<string, readonly string[]> = {
  batu: ['moai', 'rock', 'stone'],
  moai: ['moai', 'stone'],
  tengkorak: ['skull'],
  nangis: ['cry', 'sobbing', 'tear'],
  ngakak: ['joy', 'rolling on the floor', 'grin'],
  ketawa: ['laugh', 'grin', 'smile', 'joy'],
  senyum: ['smile', 'grin'],
  marah: ['angry', 'rage', 'pouting'],
  api: ['fire', 'flame'],
  cinta: ['heart', 'love', 'kiss'],
  hati: ['heart'],
  jempol: ['thumbs'],
  makasih: ['folded hands', 'pray'],
  doa: ['folded hands', 'pray'],
  motor: ['scooter', 'motorcycle'],
  mobil: ['automobile', 'car', 'taxi'],
  kereta: ['train', 'locomotive', 'railway'],
  pesawat: ['airplane'],
  kopi: ['coffee', 'hot beverage'],
  makan: ['food', 'noodle', 'rice', 'pizza', 'burger', 'ramen'],
  lapar: ['bowl', 'pizza', 'food', 'drooling'],
  tidur: ['sleep', 'bed', 'zzz'],
  hujan: ['rain', 'cloud', 'umbrella'],
  matahari: ['sun'],
  kucing: ['cat'],
  anjing: ['dog'],
  badut: ['clown'],
  hantu: ['ghost'],
  setan: ['smiling face with horns', 'imp', 'goblin'],
  uang: ['money', 'dollar'],
  foto: ['camera'],
  pesta: ['party'],
  bintang: ['star', 'sparkles'],
};

export function searchEmojiCatalog(query: string): EmojiCatalogItem[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return POPULAR_EMOJIS;

  const words = clean.split(/\s+/).filter(Boolean);
  const terms = new Set<string>([clean, ...words]);
  for (const w of words) {
    const aliases = EMOJI_ID_ALIASES[w];
    if (aliases) {
      for (const alias of aliases) terms.add(alias);
    }
  }
  const termList = Array.from(terms);

  const matches: EmojiCatalogItem[] = [];
  for (const item of ALL_UNIQUE_EMOJIS) {
    if (item.emoji === clean) {
      matches.unshift(item);
      continue;
    }
    if (termList.some((t) => item.name.includes(t) || item.slug.includes(t))) {
      matches.push(item);
      if (matches.length >= 96) break;
    }
  }
  return matches;
}
