import { useEffect, useState } from "react";
import { Button, Popconfirm, Table, Tag, Tooltip } from "antd";
import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { message } from "../../lib/feedback";
import { deleteQuizRun, getQuizRuns } from "../../lib/api";
import { invalidateWordMastery } from "../../lib/mastery";
import { useTranslation } from "../../context/translationContext";
import type { QuizRunRecord } from "../../types";
import { KIND_LABELS } from "../../lib/quiz";

const WORD_TYPES = new Set(["cloze", "matching", "spelling"]);
const ARTICLE_TYPES = new Set(["comprehension", "dictation"]);

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function typeLabel(quizType: string): string {
  return KIND_LABELS[quizType as keyof typeof KIND_LABELS] ?? quizType;
}

function categoriesOf(run: QuizRunRecord): string[] {
  const categories: string[] = [];
  if (run.quiz_types.some((t) => WORD_TYPES.has(t))) categories.push("單字/片語");
  if (run.quiz_types.some((t) => ARTICLE_TYPES.has(t))) categories.push("閱讀理解");
  return categories;
}

function runKey(run: QuizRunRecord): string {
  return `${run.session_id ?? ""}|${run.answered_at}`;
}

export default function QuizHistoryView({
  onExit,
  onShowTranslate,
}: {
  onExit: () => void;
  // Opening a session switches the main view back to the article.
  onShowTranslate: () => void;
}): React.ReactElement {
  const {
    actions: { loadSession },
  } = useTranslation();
  const [runs, setRuns] = useState<QuizRunRecord[] | null>(null);
  const [error, setError] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getQuizRuns()
      .then((items) => {
        if (mounted) setRuns(items);
      })
      .catch(() => {
        if (mounted) setError("無法載入測驗紀錄，請稍後再試。");
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleOpenSession(run: QuizRunRecord): Promise<void> {
    if (!run.session_id) return;
    setOpeningKey(runKey(run));
    const loaded = await loadSession(run.session_id);
    setOpeningKey(null);
    if (loaded) {
      onShowTranslate();
    } else {
      message.error("目前無法開啟這筆學習紀錄，請再試一次。");
    }
  }

  async function handleDelete(run: QuizRunRecord): Promise<void> {
    const key = runKey(run);
    setDeletingKey(key);
    try {
      await deleteQuizRun(run.answered_at, run.session_id);
      setRuns((prev) => (prev ?? []).filter((item) => runKey(item) !== key));
      // Mastery levels were rebuilt server-side; refetch on next badge mount.
      invalidateWordMastery();
      message.success("已刪除這筆測驗紀錄");
    } catch {
      message.error("刪除失敗，請稍後再試。");
    } finally {
      setDeletingKey(null);
    }
  }

  const columns: ColumnsType<QuizRunRecord> = [
    {
      title: "日期",
      dataIndex: "answered_at",
      render: (value: string) => dateFormatter.format(new Date(value)),
    },
    {
      title: "文章",
      key: "session",
      render: (_, run) => {
        if (!run.session_id) {
          return <span className="text-black/40">（學習紀錄已刪除）</span>;
        }
        const title = run.session_title?.trim() || "尚未命名的學習紀錄";
        return (
          <Tooltip title={title}>
            <Button
              type="link"
              className="h-auto max-w-45 p-0 sm:max-w-65"
              loading={openingKey === runKey(run)}
              onClick={() => void handleOpenSession(run)}
            >
              <span className="block truncate">{title}</span>
            </Button>
          </Tooltip>
        );
      },
    },
    {
      title: "類型",
      key: "categories",
      render: (_, run) =>
        categoriesOf(run).map((category) => (
          <Tag key={category} color="var(--accent)" className="m-0 mr-1">
            {category}
          </Tag>
        )),
    },
    {
      title: "題型",
      key: "quizTypes",
      render: (_, run) => run.quiz_types.map(typeLabel).join("、"),
    },
    {
      title: "分數",
      key: "score",
      render: (_, run) =>
        run.total > 0 ? `${Math.round((100 * run.correct) / run.total)}%` : "—",
    },
    {
      title: "題數",
      dataIndex: "total",
    },
    {
      title: "",
      key: "actions",
      render: (_, run) => (
        <Popconfirm
          title="刪除這筆測驗紀錄？"
          description="分數與單字掌握度會依剩下的紀錄重新計算。"
          okText="刪除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => void handleDelete(run)}
        >
          <Button
            danger
            type="text"
            aria-label="刪除測驗紀錄"
            icon={<DeleteOutlined />}
            loading={deletingKey === runKey(run)}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      <div className="w-full m-0 box-border px-8 py-10 sm:px-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold">測驗紀錄</h2>
            <p className="m-0 mt-1 text-sm opacity-60">
              每一列是一次交卷的成績，點文章名稱可回到該學習紀錄。
            </p>
          </div>
          <Button icon={<ArrowLeftOutlined />} onClick={onExit}>
            返回首頁
          </Button>
        </div>

        {error ? (
          <p className="m-0 text-base text-(--quiz-wrong)">{error}</p>
        ) : runs == null ? (
          <p className="m-0 text-base opacity-70">正在載入測驗紀錄⋯⋯</p>
        ) : runs.length === 0 ? (
          <p className="m-0 text-base opacity-70">
            還沒有任何測驗紀錄，完成一次線上測驗後就會出現在這裡。
          </p>
        ) : (
          <Table
            rowKey={runKey}
            size="small"
            columns={columns}
            dataSource={runs}
            pagination={runs.length > 20 ? { pageSize: 20 } : false}
            scroll={{ x: "max-content" }}
          />
        )}
      </div>
    </div>
  );
}
