import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Switch } from "antd";
import { DeleteOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import type { ProfileLink } from "../../../types";
import { getMyProfile, updateProfile } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { message } from "../../../lib/feedback";

type ProfileFormValues = {
  display_name: string;
  bio?: string;
  links?: ProfileLink[];
  is_public: boolean;
};

export default function ProfileEditModal({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const [form] = Form.useForm<ProfileFormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getMyProfile()
      .then((profile) => {
        if (cancelled) return;
        form.setFieldsValue({
          display_name: profile.display_name ?? "",
          bio: profile.bio ?? "",
          links: profile.links ?? [],
          is_public: profile.is_public,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSave(values: ProfileFormValues): Promise<void> {
    setSaving(true);
    try {
      const displayName = values.display_name.trim();
      // Auth metadata FIRST (supabase-js returns errors instead of throwing,
      // so check explicitly). Order matters: ensure_profile re-syncs
      // profiles.display_name from auth metadata on every login, so if the
      // second write below fails, the stores converge to the NEW name on the
      // next login. The reverse order would silently revert a rename.
      // This also keeps the header greeting (App.tsx getDisplayName) fresh;
      // supabase-js stays auth-only here, per the architecture rules.
      const { error: authError } = await supabase.auth.updateUser({
        data: { display_name: displayName },
      });
      if (authError) throw authError;
      await updateProfile({
        display_name: displayName,
        bio: values.bio ?? "",
        links: (values.links ?? []).map((link) => ({
          label: link.label.trim(),
          url: link.url.trim(),
        })),
        is_public: values.is_public,
      });
      message.success("個人檔案已更新");
      onClose();
    } catch {
      message.error("儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={
        <span>
          <UserOutlined className="mr-2 text-(--accent)" />
          編輯個人檔案
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
    >
      {loading && <p className="m-0 py-4 text-sm text-black/60">正在載入個人檔案⋯⋯</p>}
      {!loading && loadError && (
        <p className="m-0 py-4 text-sm text-red-600">無法載入個人檔案，請稍後再試。</p>
      )}
      {!loading && !loadError && (
        <Form<ProfileFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSave}
          className="mt-4"
        >
          <Form.Item
            name="display_name"
            label="顯示名稱"
            rules={[
              { required: true, whitespace: true, message: "請輸入顯示名稱" },
              { max: 60, message: "顯示名稱最多 60 字" },
            ]}
          >
            <Input maxLength={60} />
          </Form.Item>

          <Form.Item
            name="bio"
            label="自我介紹"
            rules={[{ max: 500, message: "自我介紹最多 500 字" }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>

          <Form.List name="links">
            {(fields, { add, remove }) => (
              <Form.Item label="外部連結（最多 5 條）" className="mb-4">
                <div className="flex flex-col gap-2">
                  {fields.map(({ key, name }) => (
                    <div key={key} className="flex items-start gap-2">
                      <Form.Item
                        name={[name, "label"]}
                        rules={[
                          { required: true, whitespace: true, message: "請輸入名稱" },
                          { max: 40, message: "名稱最多 40 字" },
                        ]}
                        className="mb-0 w-32 shrink-0"
                      >
                        <Input placeholder="名稱" maxLength={40} />
                      </Form.Item>
                      <Form.Item
                        name={[name, "url"]}
                        rules={[
                          { required: true, message: "請輸入網址" },
                          {
                            pattern: /^https?:\/\/.+/,
                            message: "網址必須以 http:// 或 https:// 開頭",
                          },
                        ]}
                        className="mb-0 min-w-0 flex-1"
                      >
                        <Input placeholder="https://…" />
                      </Form.Item>
                      <Button
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label="刪除這條連結"
                        onClick={() => remove(name)}
                      />
                    </div>
                  ))}
                  {fields.length < 5 && (
                    <Button
                      type="dashed"
                      icon={<PlusOutlined aria-hidden="true" />}
                      onClick={() => add({ label: "", url: "" })}
                      block
                    >
                      新增連結
                    </Button>
                  )}
                </div>
              </Form.Item>
            )}
          </Form.List>

          <Form.Item className="mb-2">
            <div className="flex items-center gap-3">
              <Form.Item name="is_public" valuePropName="checked" noStyle>
                <Switch aria-label="公開個人檔案" />
              </Form.Item>
              <span className="text-sm text-(--text-main)">公開個人檔案</span>
            </div>
            <p className="m-0 mt-1 text-xs text-(--text-muted)">
              關閉後，其他人無法檢視你的個人檔案，分享文章上的名字也不會連到這裡。
            </p>
          </Form.Item>

          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              儲存
            </Button>
          </div>
        </Form>
      )}
    </Modal>
  );
}
