import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import type { TaskDef } from '@piscinas/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card, CardHeader } from '../../../components/ui/Card.js';
import { Field, Input } from '../../../components/ui/Input.js';
import { Modal } from '../../../components/ui/Modal.js';
import { SkeletonText } from '../../../components/ui/Skeleton.js';
import { StatusPill } from '../../../components/ui/StatusPill.js';
import { toast } from '../../../components/ui/toast.js';
import type { DbFailure } from '../../../lib/dbError.js';
import { createTask, fetchTaskDefs, updateTask } from '../lib/data.js';
import { ServiceLogAlert } from './ServiceLogAlert.js';

/**
 * Ajustes → Tareas: the org's visit checklist (admins). Order is the order technicians see;
 * a task that was ever logged can only be deactivated, never deleted.
 */
export function TaskListSettings({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TaskDef[] | null>(null);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [editing, setEditing] = useState<TaskDef | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchTaskDefs();
    setTasks(r.data);
    setFailure(r.failure);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(...ops: Promise<DbFailure | null>[]) {
    setBusy(true);
    const results = await Promise.all(ops);
    setBusy(false);
    const f = results.find(Boolean) ?? null;
    if (f) setFailure(f);
    else void load();
  }

  /** Swap with the neighbour: renumber both so equal `orden` values can't stall a move. */
  function move(i: number, dir: -1 | 1) {
    if (!tasks) return;
    const j = i + dir;
    if (j < 0 || j >= tasks.length) return;
    void run(updateTask(tasks[i].id, { orden: j + 1 }), updateTask(tasks[j].id, { orden: i + 1 }));
  }

  return (
    <Card padded={false}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardHeader
          title={t('serviceLog.tasks.listTitle')}
          description={t('serviceLog.tasks.listHint')}
          actions={
            !failure && (
              <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
                <Plus aria-hidden size={14} />
                {t('serviceLog.tasks.add')}
              </Button>
            )
          }
        />
      </div>
      {failure ? (
        <div className="px-5 pb-5 sm:px-6">
          <ServiceLogAlert failure={failure} />
        </div>
      ) : !tasks ? (
        <div className="px-5 pb-5 sm:px-6">
          <SkeletonText lines={3} />
        </div>
      ) : (
        <ol aria-label={t('serviceLog.tasks.listTitle')}>
          {tasks.map((task, i) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center gap-1 border-t border-border px-5 py-2 sm:px-6"
            >
              <span
                className={
                  task.activo
                    ? 'min-w-0 flex-1 text-sm text-text'
                    : 'min-w-0 flex-1 text-sm text-text-muted'
                }
              >
                {task.nombre}
              </span>
              {!task.activo && (
                <StatusPill tone="neutral" dot={false}>
                  {t('serviceLog.inactive')}
                </StatusPill>
              )}
              <Button
                size="icon"
                variant="ghost"
                disabled={busy || i === 0}
                aria-label={t('serviceLog.tasks.moveUp', { name: task.nombre })}
                onClick={() => move(i, -1)}
              >
                <ArrowUp aria-hidden size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy || i === tasks.length - 1}
                aria-label={t('serviceLog.tasks.moveDown', { name: task.nombre })}
                onClick={() => move(i, 1)}
              >
                <ArrowDown aria-hidden size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`${t('common.edit')}: ${task.nombre}`}
                onClick={() => setEditing(task)}
              >
                <Pencil aria-hidden size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={`${task.activo ? t('serviceLog.deactivate') : t('serviceLog.activate')}: ${task.nombre}`}
                onClick={() => void run(updateTask(task.id, { activo: !task.activo }))}
              >
                {task.activo ? t('serviceLog.deactivate') : t('serviceLog.activate')}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <TaskModal
          task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (nombre) => {
            const f =
              editing === 'new'
                ? await createTask(orgId, nombre, (tasks?.length ?? 0) + 1)
                : await updateTask(editing.id, { nombre });
            if (f) return f;
            setEditing(null);
            toast(t('settings.saved'));
            void load();
            return null;
          }}
        />
      )}
    </Card>
  );
}

function TaskModal({
  task,
  onClose,
  onSave,
}: {
  task: TaskDef | null;
  onClose: () => void;
  onSave: (nombre: string) => Promise<DbFailure | null>;
}) {
  const { t } = useTranslation();
  const [nombre, setNombre] = useState(task?.nombre ?? '');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    setFailure(await onSave(nombre));
    setSaving(false);
  }

  return (
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={task ? t('serviceLog.tasks.edit') : t('serviceLog.tasks.add')}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ServiceLogAlert failure={failure} />
        <Field label={t('serviceLog.name')}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={!nombre.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
