// The credit DB-IP's free databases ask for (CC BY 4.0): a link beside what was placed with them.
export function DbIp({ label }: { label: string }) {
  return (
    <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  )
}
