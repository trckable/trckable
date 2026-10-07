// The Data page's top card: the key numbers and the chart, under the kit's top
// line (an icon tile, the name, and what the numbers are compared with).
import { LayoutDashboard } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '../../kit/Card'

export function OverviewCard({ status, children }: { status: string; children: ReactNode }) {
  return (
    <Card className="overview" label={'Overview'} icon={<LayoutDashboard size={15} strokeWidth={1.8} />} title={'Overview'} status={status}>
      {children}
    </Card>
  )
}
