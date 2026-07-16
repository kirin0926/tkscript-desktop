import { useState } from 'react'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { Field, FormSection, PanelShell } from './panel-kit'

export const WorksSettingsPanel = () => {
  const [title, setTitle] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [scheduleCount, setScheduleCount] = useState('1')
  const [cartEnabled, setCartEnabled] = useState(false)
  const [cartProductId, setCartProductId] = useState('')

  return (
    <PanelShell title="作品设置" description="配置作品标题、定时发布与挂车商品">
      <div className="space-y-8">
        <FormSection title="标题">
          <Field label="统一标题名" htmlFor="works-title" className="sm:col-span-2" hint="所有作品将使用同一标题">
            <Input
              id="works-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入统一标题"
            />
          </Field>
        </FormSection>

        <FormSection title="定时发布">
          <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
            <div className="space-y-0.5">
              <Label htmlFor="works-scheduled">启用定时发布</Label>
              <p className="text-xs text-muted-foreground">按设定的时间条数分批发布作品</p>
            </div>
            <Switch id="works-scheduled" checked={scheduled} onCheckedChange={setScheduled} />
          </div>
          <Field label="定时时间条数" htmlFor="works-schedule-count">
            <Input
              id="works-schedule-count"
              type="number"
              min={1}
              value={scheduleCount}
              onChange={(e) => setScheduleCount(e.target.value)}
              disabled={!scheduled}
            />
          </Field>
        </FormSection>

        <FormSection title="挂车商品">
          <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
            <div className="space-y-0.5">
              <Label htmlFor="works-cart">启用挂车商品 ID</Label>
              <p className="text-xs text-muted-foreground">发布时关联指定商品 ID</p>
            </div>
            <Switch id="works-cart" checked={cartEnabled} onCheckedChange={setCartEnabled} />
          </div>
          <Field label="挂车商品 ID" htmlFor="works-cart-id" className="sm:col-span-2">
            <Input
              id="works-cart-id"
              value={cartProductId}
              onChange={(e) => setCartProductId(e.target.value)}
              disabled={!cartEnabled}
              placeholder="请输入挂车商品 ID"
            />
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}
