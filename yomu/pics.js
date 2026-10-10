// A picture for a word: an emoji chosen from the word's English meaning (its first sense), so a deck card and a
// story's word list show 🍎 next to りんご. Only concrete, unambiguous senses are mapped; anything else gets nothing
// rather than a wrong picture. Pure: node yomu/pics.test.mjs

const PICS = {
  // people and body
  "i": "🙋", "me": "🙋", "you": "👉", "friend": "🧑‍🤝‍🧑", "family": "👨‍👩‍👧", "mother": "👩", "father": "👨", "mom": "👩", "dad": "👨", "child": "🧒", "children": "🧒", "baby": "👶", "boy": "👦", "girl": "👧",
  "man": "👨", "woman": "👩", "person": "🧑", "people": "👥", "older brother": "👦", "older sister": "👧", "younger brother": "👦", "younger sister": "👧", "grandfather": "👴", "grandmother": "👵",
  "teacher": "🧑‍🏫", "student": "🧑‍🎓", "doctor": "🧑‍⚕️", "police officer": "👮", "police": "👮", "company employee": "🧑‍💼", "office worker": "🧑‍💼", "cook": "🧑‍🍳", "nurse": "🧑‍⚕️", "king": "🤴",
  "eye": "👁️", "eyes": "👀", "ear": "👂", "nose": "👃", "mouth": "👄", "hand": "✋", "foot": "🦶", "leg": "🦵", "head": "🗣️", "hair": "💇", "tooth": "🦷", "teeth": "🦷", "heart": "❤️", "face": "😀", "body": "🧍",
  "finger": "☝️", "stomach": "🫃", "bone": "🦴", "blood": "🩸", "brain": "🧠",
  // animals
  "dog": "🐶", "cat": "🐱", "bird": "🐦", "fish": "🐟", "horse": "🐴", "cow": "🐮", "pig": "🐷", "chicken": "🐔", "monkey": "🐵", "mouse": "🐭", "rabbit": "🐰", "bear": "🐻", "sheep": "🐑", "snake": "🐍",
  "tiger": "🐯", "elephant": "🐘", "lion": "🦁", "insect": "🐛", "bug": "🐛", "butterfly": "🦋", "frog": "🐸", "whale": "🐳", "turtle": "🐢", "deer": "🦌", "fox": "🦊", "wolf": "🐺", "egg": "🥚", "animal": "🐾",
  // food and drink
  "food": "🍱", "meal": "🍱", "rice": "🍚", "cooked rice": "🍚", "bread": "🍞", "meat": "🥩", "vegetable": "🥦", "vegetables": "🥦", "fruit": "🍇", "apple": "🍎", "banana": "🍌", "orange": "🍊", "strawberry": "🍓",
  "grape": "🍇", "peach": "🍑", "watermelon": "🍉", "lemon": "🍋", "tomato": "🍅", "potato": "🥔", "carrot": "🥕", "onion": "🧅", "mushroom": "🍄", "corn": "🌽", "beans": "🫘",
  "water": "💧", "tea": "🍵", "green tea": "🍵", "black tea": "🫖", "coffee": "☕", "milk": "🥛", "juice": "🧃", "beer": "🍺", "sake": "🍶", "alcohol": "🍶", "wine": "🍷", "soup": "🍲", "salt": "🧂", "sugar": "🍬",
  "cake": "🍰", "candy": "🍬", "sweets": "🍬", "ice cream": "🍦", "chocolate": "🍫", "cookie": "🍪", "sushi": "🍣", "ramen": "🍜", "noodles": "🍜", "curry": "🍛", "pizza": "🍕", "hamburger": "🍔", "sandwich": "🥪",
  "lunch": "🍱", "box lunch": "🍱", "breakfast": "🍳", "dinner": "🍽️", "supper": "🍽️", "chopsticks": "🥢", "cup": "🥤", "glass": "🥛", "plate": "🍽️", "knife": "🔪", "spoon": "🥄", "fork": "🍴", "bottle": "🍾",
  "butter": "🧈", "cheese": "🧀", "honey": "🍯", "pepper": "🌶️", "oil": "🫗",
  // home and things
  "house": "🏠", "home": "🏠", "room": "🛋️", "door": "🚪", "window": "🪟", "key": "🔑", "bed": "🛏️", "chair": "🪑", "desk": "🖥️", "table": "🍽️", "bath": "🛁", "toilet": "🚽", "kitchen": "🍳", "garden": "🌳",
  "clock": "🕰️", "watch": "⌚", "telephone": "📞", "phone": "📱", "television": "📺", "tv": "📺", "radio": "📻", "camera": "📷", "computer": "💻", "letter": "✉️", "stamp": "📮", "newspaper": "📰", "magazine": "📖",
  "book": "📖", "notebook": "📓", "pen": "🖊️", "pencil": "✏️", "paper": "📄", "bag": "👜", "umbrella": "☂️", "glasses": "👓", "hat": "🧢", "shoes": "👟", "clothes": "👕", "shirt": "👕", "trousers": "👖", "pants": "👖",
  "coat": "🧥", "socks": "🧦", "kimono": "👘", "ring": "💍", "money": "💴", "yen": "💴", "wallet": "👛", "ticket": "🎫", "present": "🎁", "gift": "🎁", "box": "📦", "map": "🗺️", "picture": "🖼️", "photograph": "📷",
  "photo": "📷", "flower": "🌸", "tree": "🌳", "light": "💡", "lamp": "💡", "candle": "🕯️", "soap": "🧼", "toothbrush": "🪥", "medicine": "💊", "scissors": "✂️", "needle": "🪡", "thread": "🧵", "rope": "🪢",
  "guitar": "🎸", "piano": "🎹", "drum": "🥁", "ball": "⚽", "doll": "🪆", "toy": "🧸", "cigarette": "🚬", "trash": "🗑️", "garbage": "🗑️", "refrigerator": "🧊", "mirror": "🪞", "battery": "🔋", "plug": "🔌",
  // places and travel
  "school": "🏫", "university": "🎓", "hospital": "🏥", "bank": "🏦", "post office": "🏣", "station": "🚉", "airport": "✈️", "hotel": "🏨", "restaurant": "🍽️", "shop": "🏪", "store": "🏪", "convenience store": "🏪",
  "supermarket": "🛒", "department store": "🏬", "library": "📚", "park": "🏞️", "museum": "🏛️", "church": "⛪", "temple": "🛕", "shrine": "⛩️", "castle": "🏯", "company": "🏢", "office": "🏢", "factory": "🏭",
  "building": "🏢", "town": "🏘️", "city": "🏙️", "village": "🏡", "country": "🌍", "world": "🌍", "japan": "🇯🇵", "america": "🇺🇸", "road": "🛣️", "street": "🛣️", "bridge": "🌉", "river": "🏞️", "sea": "🌊", "ocean": "🌊",
  "mountain": "⛰️", "lake": "🏞️", "island": "🏝️", "forest": "🌲", "beach": "🏖️", "sky": "☁️", "sun": "☀️", "moon": "🌙", "star": "⭐", "earth": "🌍", "field": "🌾", "pond": "🪷", "hot spring": "♨️", "cinema": "🎬",
  "movie theater": "🎬", "theater": "🎭", "zoo": "🦁", "pool": "🏊", "swimming pool": "🏊", "gym": "🏋️", "stadium": "🏟️", "cafe": "☕", "coffee shop": "☕", "bar": "🍸", "parking lot": "🅿️", "elevator": "🛗",
  "car": "🚗", "automobile": "🚗", "bus": "🚌", "train": "🚆", "electric train": "🚆", "bicycle": "🚲", "bike": "🚲", "airplane": "✈️", "plane": "✈️", "ship": "🚢", "boat": "⛵", "taxi": "🚕", "subway": "🚇", "truck": "🚚",
  "motorcycle": "🏍️", "rocket": "🚀", "helicopter": "🚁", "traffic light": "🚦", "ticket gate": "🎫", "platform": "🚉", "suitcase": "🧳", "passport": "🛂", "luggage": "🧳",
  // weather, time, nature
  "rain": "🌧️", "snow": "❄️", "wind": "🌬️", "cloud": "☁️", "weather": "🌤️", "storm": "⛈️", "typhoon": "🌀", "thunder": "⚡", "fire": "🔥", "ice": "🧊", "spring": "🌸", "summer": "☀️", "autumn": "🍂", "fall": "🍂", "winter": "⛄",
  "morning": "🌅", "noon": "🕛", "evening": "🌆", "night": "🌃", "today": "📅", "tomorrow": "📅", "yesterday": "📅", "week": "📅", "month": "📅", "year": "📅", "birthday": "🎂", "holiday": "🎌", "calendar": "📅",
  "time": "⏰", "hour": "⏰", "minute": "⏱️", "new year": "🎍", "christmas": "🎄", "festival": "🎆", "party": "🎉", "wedding": "💒", "funeral": "⚰️",
  // activities and abstract-but-clear
  "music": "🎵", "song": "🎵", "sport": "🏃", "sports": "🏃", "baseball": "⚾", "soccer": "⚽", "football": "⚽", "tennis": "🎾", "basketball": "🏀", "golf": "⛳", "ski": "⛷️", "skiing": "⛷️", "swimming": "🏊", "judo": "🥋",
  "karate": "🥋", "sumo": "🤼", "game": "🎮", "video game": "🎮", "movie": "🎬", "film": "🎬", "dance": "💃", "art": "🎨", "painting": "🎨", "study": "📚", "homework": "📝", "test": "📝", "exam": "📝", "class": "🏫",
  "lesson": "📖", "work": "💼", "job": "💼", "meeting": "🤝", "trip": "🧳", "travel": "🧳", "vacation": "🏖️", "shopping": "🛍️", "cooking": "🍳", "walk": "🚶", "run": "🏃", "sleep": "😴", "love": "❤️", "question": "❓",
  "answer": "💡", "telephone call": "📞", "mail": "✉️", "e-mail": "📧", "email": "📧", "internet": "🌐", "news": "📰", "dictionary": "📕", "language": "🗣️", "english": "🇬🇧", "japanese language": "🇯🇵", "word": "🔤", "number": "🔢",
  "to eat": "🍽️", "to drink": "🥤", "to sleep": "😴", "to run": "🏃", "to walk": "🚶", "to swim": "🏊", "to read": "📖", "to write": "✍️", "to listen": "👂", "to hear": "👂", "to see": "👀", "to look": "👀", "to watch": "👀",
  "to speak": "🗣️", "to talk": "🗣️", "to sing": "🎤", "to buy": "🛒", "to cook": "🍳", "to study": "📚", "to laugh": "😂", "to cry": "😢", "to fly": "✈️", "to rain": "🌧️", "to snow": "❄️", "to call": "📞", "to telephone": "📞",
  "to open": "🚪", "to close": "🚪", "to cut": "✂️", "to wash": "🧼", "to drive": "🚗", "to ride": "🚲", "to dance": "💃", "to play": "🎮", "to work": "💼", "to rest": "🛋️", "to think": "🤔", "to love": "❤️", "to die": "💀",
  "to fall": "🍂", "to climb": "🧗", "to throw": "🤾", "to kick": "🦵", "to push": "👉", "to pull": "🪢", "to carry": "🎒", "to send": "📮", "to give": "🎁", "to receive": "🎁", "to photograph": "📷", "to take a photo": "📷",
  // adjectives and simple states
  "big": "🐘", "large": "🐘", "small": "🐜", "little": "🐜", "hot": "🔥", "cold": "🧊", "warm": "🌤️", "cool": "🍃", "new": "✨", "old": "🏚️", "fast": "⚡", "quick": "⚡", "slow": "🐢", "tall": "🦒", "high": "🏔️", "low": "⬇️",
  "long": "📏", "short": "📏", "heavy": "🏋️", "light (weight)": "🪶", "expensive": "💎", "cheap": "🏷️", "delicious": "😋", "tasty": "😋", "sweet": "🍬", "spicy": "🌶️", "bitter": "☕", "sour": "🍋", "beautiful": "🌸", "pretty": "🌸",
  "ugly": "🙈", "happy": "😊", "sad": "😢", "angry": "😠", "fun": "🎉", "enjoyable": "🎉", "scary": "😱", "dangerous": "⚠️", "safe": "🛡️", "busy": "🏃", "free": "🆓", "sick": "🤒", "ill": "🤒", "healthy": "💪", "strong": "💪",
  "weak": "🥀", "quiet": "🤫", "noisy": "📢", "loud": "📢", "bright": "☀️", "dark": "🌑", "clean": "🧼", "dirty": "🧹", "wide": "↔️", "narrow": "↕️", "round": "⚪", "square": "⬜", "near": "📍", "far": "🔭", "many": "👥", "few": "🤏",
  "red": "🔴", "blue": "🔵", "green": "🟢", "yellow": "🟡", "white": "⚪", "black": "⚫", "brown": "🟤", "orange (color)": "🟠", "purple": "🟣", "pink": "🩷", "color": "🎨", "colour": "🎨",
  "one": "1️⃣", "two": "2️⃣", "three": "3️⃣", "four": "4️⃣", "five": "5️⃣", "six": "6️⃣", "seven": "7️⃣", "eight": "8️⃣", "nine": "9️⃣", "ten": "🔟", "hundred": "💯", "zero": "0️⃣", "half": "🌗",
  "left": "⬅️", "right": "➡️", "up": "⬆️", "down": "⬇️", "above": "⬆️", "below": "⬇️", "inside": "📥", "outside": "🌳", "front": "🔼", "back": "🔙", "behind": "🔙", "north": "🧭", "south": "🧭", "east": "🧭", "west": "🧭",
  "yes": "👍", "no": "👎", "hello": "👋", "goodbye": "👋", "thank you": "🙏", "sorry": "🙇", "excuse me": "🙇", "please": "🙏", "good morning": "🌅", "good night": "🌙", "congratulations": "🎉", "welcome": "👋",
};

/** The first English sense of a meaning, cleaned: "to meet, to see (a person)" → "to meet". */
export const firstSense = (m) => String(m ?? "").split(/[,;/]/)[0].replace(/\(.*?\)/g, "").replace(/^(a|an|the)\s+/i, "").trim().toLowerCase();

/** An emoji for the word's meaning, or "" when none fits for sure. */
export function pic(meaning) {
  const s = firstSense(meaning);
  if (PICS[s]) return PICS[s];
  const bare = s.replace(/^to\s+/, "");
  // "to go out" → no; "cat (animal)" → cat; "apple tree" → nothing (a different thing)
  return PICS[bare] && !s.startsWith("to ") ? PICS[bare] : "";
}
