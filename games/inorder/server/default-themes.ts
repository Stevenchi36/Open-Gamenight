/**
 * Starter themes, seeded by migration 002_default_themes and used as the
 * in-code fallback when the library has nothing to pick. Frozen with that
 * migration: to ship more defaults, add a new migration instead of editing
 * this list (the fallback may then read from the new list).
 */
export interface DefaultTheme {
  theme: string
  low: string
  high: string
}

const t = (theme: string, low: string, high: string): DefaultTheme => ({ theme, low, high })

export const DEFAULT_THEMES: Record<string, DefaultTheme[]> = {
  'Everyday Life': [
    t('How scary is it?', 'Not scary at all', 'Terrifying'),
    t('How annoying is it?', 'Barely notice it', 'Drives me mad'),
    t('How heavy is it?', 'Light as a feather', 'Impossible to lift'),
    t('How loud is it?', 'Silent', 'Deafening'),
    t('How expensive is it?', 'Practically free', 'Costs a fortune'),
    t('How useful is it in an emergency?', 'Useless', 'Lifesaver'),
    t('How embarrassing would it be?', 'No big deal', 'Want to disappear'),
    t('How big is it?', 'Tiny', 'Enormous'),
    t('How dangerous is it?', 'Perfectly safe', 'Deadly'),
    t('How long does it take?', 'A second', 'Years'),
    t('How messy is it?', 'Spotless', 'Total chaos'),
    t('How hard is it to learn?', 'Anyone can do it', 'Takes a lifetime'),
  ],
  'Food & Drink': [
    t('How tasty is it?', 'Yuck', 'Delicious'),
    t('How spicy is it?', 'Not at all', 'Mouth on fire'),
    t('How healthy is it?', 'Very unhealthy', 'Super healthy'),
    t('How sweet is it?', 'Not sweet at all', 'Sugar overload'),
    t('How messy is it to eat?', 'Clean hands', 'Need a bath after'),
    t('How fancy is it?', 'Everyday', 'Posh restaurant'),
    t('How filling is it?', 'Still starving', "Can't move"),
    t('How smelly is it?', 'No smell', 'Clears the room'),
    t('How good is it on toast?', 'Never on toast', 'Perfect on toast'),
    t('How long does it take to make?', 'Instant', 'All day'),
    t('How likely are kids to eat it?', 'Never', "They'd fight for it"),
    t('How crunchy is it?', 'Soft as soup', 'Crunchiest thing ever'),
  ],
  'Animals & Nature': [
    t('How cute is it?', 'Not cute at all', 'Adorable'),
    t('How fast is it?', 'Slow', 'Lightning fast'),
    t('How strong is it?', 'Weak', 'Incredibly strong'),
    t('How good a pet would it make?', 'Terrible pet', 'Perfect pet'),
    t('How fierce is it?', 'Gentle', 'Ferocious'),
    t('How long does it live?', 'A few days', 'Hundreds of years'),
    t('How cold is it?', 'Scorching', 'Freezing'),
    t('How rare is it?', 'Everywhere', 'Almost never seen'),
    t('How tall is it?', 'Ground level', 'Towers over everything'),
    t('How smelly is it?', 'Smells lovely', 'Stinks'),
    t('How clever is it?', 'Not clever', 'Genius'),
    t('How colourful is it?', 'Plain', 'Every colour'),
  ],
  'Fun & Fantasy': [
    t('How good would it be as a superpower?', 'Useless', 'Best power ever'),
    t('How fun is it?', 'Boring', 'Most fun ever'),
    t('How magical is it?', 'Completely ordinary', 'Pure magic'),
    t('How good a holiday would it be?', 'Worst trip ever', 'Dream holiday'),
    t('How exciting is it?', 'Snooze', 'Edge of your seat'),
    t('How brave would you have to be?', 'Easy', 'Bravest person alive'),
    t('How good a present would it be?', 'Disappointing', 'Best present ever'),
    t('How famous is it?', 'Nobody knows it', 'Everyone knows it'),
    t('How good would it be in a zombie attack?', 'Useless', 'Saves the day'),
    t('How cool is it?', 'Not cool at all', 'Coolest thing ever'),
    t('How good a villain would it make?', 'Harmless', 'Pure evil'),
    t('How likely is it to happen in your lifetime?', 'Never', 'Definitely'),
  ],
  'Feelings & People': [
    t('How happy would it make you?', 'Miserable', 'Over the moon'),
    t('How stressful is it?', 'Totally relaxing', 'Pure panic'),
    t('How romantic is it?', 'Not at all', 'Very romantic'),
    t('How rude is it?', 'Polite', 'Shockingly rude'),
    t('How good is it as an excuse for being late?', 'Nobody believes it', 'Totally fine'),
    t('How tiring is it?', 'Effortless', 'Exhausting'),
    t('How grown-up is it?', 'Childish', 'Very grown-up'),
    t('How likely is it to make you cry?', 'Never', 'Floods of tears'),
    t('How popular is it with kids?', 'Kids hate it', 'Kids love it'),
    t('How brave is it?', 'Cowardly', 'Heroic'),
    t('How awkward is it?', 'Smooth', 'Cringe'),
    t('How relaxing is it?', 'Stressful', 'Blissful'),
  ],
}

export const DEFAULT_THEME_LIST: (DefaultTheme & { category: string })[] = Object.entries(DEFAULT_THEMES).flatMap(([category, list]) =>
  list.map((theme) => ({ category, ...theme })),
)

export const DEFAULT_CATEGORIES = Object.keys(DEFAULT_THEMES)
