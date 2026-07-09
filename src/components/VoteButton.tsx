// Presentational upvote control (♥ + count). State lives in `useVotes`; this
// just renders the current count / mine-state and reports taps. Used on Food
// cards; the map popups render an HTML twin of this (see MapView.popupHtml).
export default function VoteButton({
  count,
  active,
  onVote,
}: {
  count: number
  active: boolean
  onVote: () => void
}) {
  return (
    <button
      type="button"
      className={`votebtn${active ? ' votebtn--on' : ''}`}
      onClick={onVote}
      aria-pressed={active}
      aria-label={active ? 'Remove your vote' : 'Upvote this spot'}
      title={active ? 'Remove your vote' : 'Upvote this spot'}
    >
      <span className="votebtn-heart" aria-hidden>{active ? '♥' : '♡'}</span>
      <span className="votebtn-count mono">{count}</span>
    </button>
  )
}
