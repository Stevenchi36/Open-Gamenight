import { reactive } from 'vue'

// Set by the room page while a game is on: the app bar hides so the game gets the whole height.
export const layout = reactive({ immersive: false })
