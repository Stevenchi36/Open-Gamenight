import { reactive } from 'vue'

// Pages that want the whole height hide the app bar while any key is on: the room page during a
// game, the watch page while it shows a room. One key per page, because Vue runs the old page's
// unmount after the new page's setup, so a shared flag would be cleared by the page being left.
export const immersive = reactive({ room: false, watch: false })
