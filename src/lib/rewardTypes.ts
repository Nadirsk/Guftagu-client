/** Everything a reward slot (daily check-in, ranking) can pay: currency, or a Store item. */
export const REWARD_TYPE_LABELS: Record<string, string> = {
  coins: 'Coins',
  diamonds: 'Diamonds',
  frame: 'Frame',
  entrance_effect: 'Entry effect',
  entry_banner: 'Entry banner',
  bubble: 'Chat bubble',
  profile_card: 'Profile card',
  mic_wave: 'Mic wave',
  room_background: 'Room background',
  floating_screen: 'Floating screen',
}

export const REWARD_TYPES = Object.keys(REWARD_TYPE_LABELS)

export const isItemReward = (type: string) => !['coins', 'diamonds'].includes(type)
