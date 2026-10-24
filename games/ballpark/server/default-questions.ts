/**
 * Starter questions, seeded by migration 002_default_questions and used as the
 * in-code fallback when the library has nothing to pick. Frozen with that
 * migration: to ship more defaults, add a new migration instead of editing
 * this list (the fallback may then read from the new list).
 */
import type { UnitCode } from '../shared/units.ts'

export interface DefaultQuestion {
  category: string
  question: string
  answer: number
  unit: UnitCode | null
  fact: string | null
}

type Entry = [question: string, answer: number, unit: UnitCode | null, fact?: string]

export const DEFAULT_QUESTIONS: Record<string, Entry[]> = {
  Geography: [
    ['How tall is Mount Everest?', 8849, 'm', 'From the 2020 survey by China and Nepal'],
    ['How long is the River Nile?', 6650, 'km'],
    ['How many countries are members of the United Nations?', 193, null],
    ['How deep is the deepest known point of the ocean, the Challenger Deep?', 10935, 'm', 'Surveys differ slightly'],
    ['How long is the Great Wall of China, counting all its sections?', 21196, 'km', "From China's 2012 survey"],
    ['How tall is Angel Falls, the highest waterfall in the world?', 979, 'm'],
    ['How many islands make up Japan?', 14125, null, 'A 2023 recount, up from the 6,852 long quoted'],
    ['How deep is Lake Baikal, the deepest lake in the world?', 1642, 'm'],
    ['How tall is Mount Kilimanjaro?', 5895, 'm'],
    ['How big is the Sahara Desert?', 9200000, 'km2'],
    ['How far is it from London to New York, as the crow flies?', 5570, 'km'],
    ['How long is the Panama Canal?', 82, 'km'],
  ],
  Science: [
    ['At what temperature does iron melt?', 1538, 'C'],
    ['What is the hottest air temperature ever recorded on Earth?', 56.7, 'C', 'Death Valley, California, in 1913'],
    ['What is the coldest air temperature ever recorded on Earth?', -89.2, 'C', 'Vostok Station, Antarctica, in 1983'],
    ['How many elements are in the periodic table?', 118, null],
    ['How fast does sound travel through air at room temperature?', 1235, 'km/h'],
    ['At what temperature does water boil on the summit of Mount Everest?', 70, 'C', 'Roughly: the air pressure up there is about a third of sea level'],
    ['What is the average distance from the Earth to the Moon?', 384400, 'km'],
    ['What is the average distance from the Earth to the Sun?', 149600000, 'km'],
    ['How hot is the surface of the Sun?', 5500, 'C'],
    ['How long does sunlight take to reach the Earth?', 8.3, 'min'],
    ['How wide is the Earth through the middle?', 12742, 'km', 'The average diameter'],
    ['How long is the equator?', 40075, 'km'],
  ],
  Space: [
    ['How long is one day on Venus, in Earth days?', 243, 'days', 'Longer than its year of 225 Earth days'],
    ['How long is a year on Mars, in Earth days?', 687, 'days'],
    ['How many moons does Mars have?', 2, null, 'Phobos and Deimos'],
    ['How many people have walked on the Moon?', 12, null, 'All between 1969 and 1972'],
    ['How fast does the International Space Station travel?', 28000, 'km/h', 'It circles the Earth about every 90 minutes'],
    ['How high above the Earth does the International Space Station orbit?', 400, 'km', 'Roughly: it slowly sinks and gets boosted back up'],
    ['How tall was the Saturn V rocket that launched Apollo 11?', 110.6, 'm'],
    ['In what year did people first land on the Moon?', 1969, null],
  ],
  History: [
    ['In what year did the Titanic sink?', 1912, null],
    ['How long did the Titanic take to sink after hitting the iceberg?', 160, 'min'],
    ['In what year did the Berlin Wall fall?', 1989, null],
    ['In what year did the Eiffel Tower open?', 1889, null],
    ['In what year was the first iPhone released?', 2007, null],
    ['In what year did the First World War begin?', 1914, null],
    ['In what year did Columbus first reach the Americas?', 1492, null],
    ['How many years did the Hundred Years War actually last?', 116, 'years', 'From 1337 to 1453'],
    ['In what year did the Wright brothers make the first powered flight?', 1903, null],
    ['How tall was the Great Pyramid of Giza when it was built?', 146.6, 'm', 'It lost its top and outer casing over the centuries'],
  ],
  Landmarks: [
    ['How tall is the Eiffel Tower?', 330, 'm', 'Including the antennas on top'],
    ['How tall is the Burj Khalifa, the tallest building in the world?', 828, 'm'],
    ['How tall is the Statue of Liberty, from the ground to the tip of the torch?', 93, 'm'],
    ['How long is the Golden Gate Bridge, end to end?', 2737, 'm'],
  ],
  'Human Body': [
    ['How many bones are in an adult human body?', 206, null],
    ['How many teeth does an adult have, including wisdom teeth?', 32, null],
    ['How much blood is in an adult human body?', 5, 'l', 'About; it depends on body size'],
    ['How many hairs are on a typical human head?', 100000, null, 'On average'],
    ['How many times does a human heart beat in a day?', 100000, null, 'About, at a resting rate'],
    ['What is normal human body temperature?', 37, 'C'],
    ['How heavy is an adult human brain?', 1.4, 'kg'],
    ['How heavy is an adult human heart?', 300, 'g'],
  ],
  Animals: [
    ['How fast can a cheetah run?', 112, 'km/h', 'In short bursts'],
    ['How fast can a peregrine falcon dive?', 390, 'km/h', 'The fastest animal on Earth'],
    ['How many hearts does an octopus have?', 3, null],
    ['How many legs does a lobster have?', 10, null, 'Including the two with claws'],
    ['How many eyes does a honeybee have?', 5, null, 'Two big ones and three small ones on top'],
    ['How heavy is an ostrich egg?', 1.4, 'kg'],
    ['How many teeth does an adult dog have?', 42, null],
    ['How many compartments does a cow stomach have?', 4, null],
    ['How long can a blue whale grow?', 30, 'm', 'The largest animal ever known'],
  ],
  'Sport & Games': [
    ['How long is a marathon?', 42.195, 'km'],
    ['How high is a basketball hoop?', 3.05, 'm'],
    ['What is the most a golf ball is allowed to weigh?', 45.93, 'g'],
    ['How heavy is the shot in the men\'s Olympic shot put?', 7.26, 'kg'],
    ['How many players does a rugby union team have on the pitch?', 15, null],
    ['How long is a cricket pitch, from stumps to stumps?', 20.12, 'm'],
    ['How high is a tennis net at the centre?', 0.914, 'm'],
    ['How many keys does a standard piano have?', 88, null],
    ['How many dots are on a pair of standard dice in total?', 42, null],
    ['How many cards are in a standard deck, including two jokers?', 54, null],
  ],
}

export const DEFAULT_QUESTION_LIST: DefaultQuestion[] = Object.entries(DEFAULT_QUESTIONS).flatMap(([category, list]) =>
  list.map(([question, answer, unit, fact]) => ({ category, question, answer, unit, fact: fact ?? null })),
)

export const DEFAULT_CATEGORIES = Object.keys(DEFAULT_QUESTIONS)
