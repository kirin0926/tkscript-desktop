import { useSettings } from '@/app/components/settings/SettingsContext'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { Field, FormSection, PanelShell } from './panel-kit'

export const WorksSettingsPanel = () => {
  const { settings, update } = useSettings()
  const works = settings.works

  return (
    <PanelShell title="作品设置" description="配置 TikTok 视频标题、标签与定时发布">
      <div className="space-y-8">
        <FormSection title="标题与标签">
          <Field label="视频标题" htmlFor="works-title" className="sm:col-span-2" hint="所有视频将使用同一标题">
            <Input
              id="works-title"
              value={works.title}
              onChange={(e) => update('works', { title: e.target.value })}
              placeholder="请输入视频标题"
            />
          </Field>
          {works.title && (
            <Field label="预览" className="sm:col-span-2">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {works.title}
              </div>
            </Field>
          )}
          <Field label="话题标签" htmlFor="works-hashtags" className="sm:col-span-2" hint="多个标签用空格分隔，如 #fyp #viral">
            <Input
              id="works-hashtags"
              value={works.hashtags}
              onChange={(e) => update('works', { hashtags: e.target.value })}
              placeholder="#fyp #viral #trending"
            />
          </Field>
        </FormSection>

        <FormSection title="定时发布">
          <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
            <div className="space-y-0.5">
              <Label htmlFor="works-scheduled">启用定时发布</Label>
              <p className="text-xs text-muted-foreground">按设定的时间间隔分批发布视频</p>
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
      </div>
    </PanelShell>
  )
}