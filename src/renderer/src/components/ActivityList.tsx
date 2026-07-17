import type { AutomationEvent, ProfileSettings } from '../../../shared/types'

export function ActivityList({
  events,
  profiles
}: {
  events: AutomationEvent[]
  profiles: ProfileSettings[]
}): React.JSX.Element | null {
  if (events.length === 0) return null

  return (
    <section className="activity-section">
      <h2>Automation activity</h2>
      <div className="activity-list">
        {events.slice(0, 20).map((event) => {
          const profile = profiles.find((candidate) => candidate.id === event.profileId)
          return (
            <div className={`activity-row ${event.level}`} key={event.id}>
              <div className="activity-dot" />
              <div>
                <div>{event.message}</div>
                <time>{formatTimestamp(event.timestamp, profile?.name)}</time>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function formatTimestamp(timestamp: number, profileName?: string): string {
  const date = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
  return profileName ? `${profileName} · ${date}` : date
}
