/** One colour per compared user, in the order they were added. Used by bars, avatars and the radar. */
export const USER_COLORS = ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#e879f9'] as const
export const userColor = (index: number): string => USER_COLORS[index % USER_COLORS.length] ?? '#818cf8'
