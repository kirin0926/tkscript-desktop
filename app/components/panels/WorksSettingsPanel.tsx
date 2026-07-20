import { useSettings } from '@/app/components/settings/SettingsContext'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { Field, FormSection, PanelShell } from './panel-kit'

export const WorksSettingsPanel = () => {
  const { settings, update } = useSettings()
  const works = settings.works

  return (
    <PanelShell title="作品设置" description="配置作品标题、定时发布与挂车商品">
      <div className="space-y-8">
        <FormSection title="标题">
          <Field label="统一标题名" htmlFor="works-title" className="sm:col-span-2" hint="所有作品将使用同一标题">
            <Input
              id="works-title"
              value={works.title}
              onChange={(e) => update('works', { title: e.target.value })}
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
            <Switch
              id="works-scheduled"
              checked={works.scheduled}
              onCheckedChange={(checked) => update('works', { scheduled: checked })}
            />
          </div>
          <Field label="定时时间条数" htmlFor="works-schedule-count">
            <Input
              id="works-schedule-count"
              type="number"
              min={1}
              value={works.scheduleCount}
              onChange={(e) => update('works', { scheduleCount: e.target.value })}
              disabled={!works.scheduled}
            />
          </Field>
        </FormSection>

        <FormSection title="挂车商品">
          <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
            <div className="space-y-0.5">
              <Label htmlFor="works-cart">启用挂车商品 ID</Label>
              <p className="text-xs text-muted-foreground">发布时关联指定商品 ID</p>
            </div>
            <Switch
              id="works-cart"
              checked={works.cartEnabled}
              onCheckedChange={(checked) => update('works', { cartEnabled: checked })}
            />
          </div>
          <Field label="挂车商品 ID" htmlFor="works-cart-id" className="sm:col-span-2">
            <Input
              id="works-cart-id"
              value={works.cartProductId}
              onChange={(e) => update('works', { cartProductId: e.target.value })}
              disabled={!works.cartEnabled}
              placeholder="请输入挂车商品 ID"
            />
          </Field>
        </FormSection>
      </div>
    </PanelShell>
  )
}
