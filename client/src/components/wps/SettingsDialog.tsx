import type { GameType } from '@tk/shared';
import { useEffect, useRef, useState } from 'react';
import {
  bossKeyFromKeyboardEvent,
  formatBossKeyShortcut,
  type BossKeyShortcut,
} from '../../utils/bossKey';
import {
  saveBossKeyAction,
  type BossKeyAction,
} from '../../utils/bossKeyConfig';
import { getImageSizeFromFile } from '../../utils/bossKeyImageProcess';
import {
  formatBossKeyTargetSize,
  getBossKeyTargetSize,
  imageMatchesBossKeyTarget,
  storedImageMatchesViewport,
  type BossKeyTargetSize,
} from '../../utils/bossKeyImageSpec';
import {
  BOSS_KEY_IMAGE_MAX_BYTES,
  clearBossKeyImage,
  hasBossKeyImage,
  loadBossKeyImageBlob,
  loadBossKeyImageMeta,
  loadBossKeyImageObjectUrl,
  saveBossKeyImage,
} from '../../utils/bossKeyImageStore';
import { BossKeyImageCropDialog } from './BossKeyImageCropDialog';
import styles from './SettingsDialog.module.css';

const DEFAULT_TITLE = '三国杀表格.xlsx';
const BOSS_TITLE = '第 1 季度区域销售汇总.xlsx';
const SHOW_APPEARANCE_SETTINGS = false;

const BG_COLOR_OPTIONS = [
  { value: '#ffffff', label: '纯白' },
  { value: '#f7f3ea', label: '米白' },
  { value: '#eef6ff', label: '浅蓝' },
  { value: '#f6f6f6', label: '浅灰' },
] as const;

interface SettingsDialogProps {
  open: boolean;
  defaultGameType: GameType;
  onDefaultGameTypeChange: (type: GameType) => void;
  bossKeyShortcut: BossKeyShortcut;
  onBossKeyShortcutChange: (shortcut: BossKeyShortcut) => void;
  bossKeyAction: BossKeyAction;
  onBossKeyActionChange: (action: BossKeyAction) => void;
  bgColorToken: string;
  onBgColorTokenChange: (token: string) => void;
  onChangeNickname?: () => void;
  onChangePassword?: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  defaultGameType,
  onDefaultGameTypeChange,
  bossKeyShortcut,
  onBossKeyShortcutChange,
  bossKeyAction,
  onBossKeyActionChange,
  bgColorToken,
  onBgColorTokenChange,
  onChangeNickname,
  onChangePassword,
  onClose,
}: SettingsDialogProps) {
  const [title, setTitle] = useState('');
  const [recordingBossKey, setRecordingBossKey] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageHint, setImageHint] = useState('');
  const [targetSize, setTargetSize] = useState<BossKeyTargetSize>(() => getBossKeyTargetSize());
  const [storedMeta, setStoredMeta] = useState<BossKeyTargetSize | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cropSourceUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const revokeCropSourceUrl = () => {
    if (cropSourceUrlRef.current) {
      URL.revokeObjectURL(cropSourceUrlRef.current);
      cropSourceUrlRef.current = null;
    }
    setCropSourceUrl(null);
  };

  const openCropSource = (url: string) => {
    revokeCropSourceUrl();
    cropSourceUrlRef.current = url;
    setCropSourceUrl(url);
  };

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;

    const syncTargetSize = () => setTargetSize(getBossKeyTargetSize());
    syncTargetSize();
    window.addEventListener('resize', syncTargetSize);

    setTitle(document.title);
    setRecordingBossKey(false);
    setImageHint('');

    let cancelled = false;
    void (async () => {
      revokePreviewUrl();
      const hasImage = await hasBossKeyImage();
      const meta = await loadBossKeyImageMeta();
      if (cancelled) return;
      setStoredMeta(meta ? { width: meta.width, height: meta.height } : null);
      if (!hasImage) {
        setImagePreviewUrl(null);
        return;
      }
      const url = await loadBossKeyImageObjectUrl();
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      previewUrlRef.current = url;
      setImagePreviewUrl(url);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', syncTargetSize);
      revokePreviewUrl();
      revokeCropSourceUrl();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !recordingBossKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = bossKeyFromKeyboardEvent(event);
      if (!shortcut) return;
      onBossKeyShortcutChange(shortcut);
      setRecordingBossKey(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, recordingBossKey, onBossKeyShortcutChange]);

  if (!open) return null;

  const saveTitle = () => {
    const next = title.trim().slice(0, 40) || DEFAULT_TITLE;
    document.title = next;
    window.localStorage.setItem('tk_browser_title', next);
    setTitle(next);
  };

  const previewBossTitle = () => {
    document.title = BOSS_TITLE;
    window.localStorage.setItem('tk_browser_title', BOSS_TITLE);
    setTitle(BOSS_TITLE);
  };

  const handleBossKeyActionChange = (action: BossKeyAction) => {
    onBossKeyActionChange(action);
    saveBossKeyAction(action);
  };

  const persistBossKeyImage = async (blob: Blob, savedTarget: BossKeyTargetSize) => {
    await saveBossKeyImage(blob, {
      width: savedTarget.width,
      height: savedTarget.height,
      mimeType: blob.type || 'image/jpeg',
      updatedAt: Date.now(),
    });
    revokePreviewUrl();
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setImagePreviewUrl(url);
    setStoredMeta({ width: savedTarget.width, height: savedTarget.height });
    setImageHint(`已保存为 ${formatBossKeyTargetSize(savedTarget)}，刷新后仍可用`);
    handleBossKeyActionChange('custom-image');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageHint('请选择图片文件（JPG / PNG / WebP）');
      return;
    }
    if (file.size > BOSS_KEY_IMAGE_MAX_BYTES) {
      setImageHint(`图片不能超过 ${Math.round(BOSS_KEY_IMAGE_MAX_BYTES / 1024 / 1024)}MB`);
      return;
    }

    const currentTarget = getBossKeyTargetSize();
    setTargetSize(currentTarget);

    try {
      const { width, height } = await getImageSizeFromFile(file);
      if (imageMatchesBossKeyTarget(width, height, currentTarget)) {
        await persistBossKeyImage(file, currentTarget);
        return;
      }
      openCropSource(URL.createObjectURL(file));
      setImageHint(`图片为 ${width} × ${height}，与要求规格不一致，请裁剪`);
    } catch (error) {
      setImageHint(error instanceof Error ? error.message : '图片读取失败');
    }
  };

  const handleRecropStoredImage = async () => {
    try {
      const blob = await loadBossKeyImageBlob();
      if (!blob) {
        setImageHint('当前没有可裁剪的图片');
        return;
      }
      setTargetSize(getBossKeyTargetSize());
      openCropSource(URL.createObjectURL(blob));
    } catch (error) {
      setImageHint(error instanceof Error ? error.message : '读取已保存图片失败');
    }
  };

  const handleCropConfirm = async (blob: Blob, savedTarget: BossKeyTargetSize) => {
    try {
      await persistBossKeyImage(blob, savedTarget);
      revokeCropSourceUrl();
    } catch (error) {
      setImageHint(error instanceof Error ? error.message : '保存失败');
    }
  };

  const handleClearImage = async () => {
    await clearBossKeyImage();
    revokePreviewUrl();
    revokeCropSourceUrl();
    setImagePreviewUrl(null);
    setStoredMeta(null);
    setImageHint('已清除自定义图片');
    if (bossKeyAction === 'custom-image') {
      handleBossKeyActionChange('regional-sales');
    }
  };

  const viewportMismatch = storedMeta && !storedImageMatchesViewport(storedMeta, targetSize);

  return (
    <>
      <div className={styles.overlay} role="dialog" aria-modal="true">
        <div className={styles.panel}>
          <div className={styles.header}>
            <h2>表格设置</h2>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
          <div className={styles.body}>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>账户</h3>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.btn} onClick={onChangeNickname}>
                  修改昵称
                </button>
                <button type="button" className={styles.btn} onClick={onChangePassword}>
                  修改密码
                </button>
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>浏览器标签页标题</h3>
              <div className={styles.titleRow}>
                <input
                  className={styles.titleInput}
                  value={title}
                  maxLength={40}
                  aria-label="浏览器标签页标题"
                  onChange={(event) => setTitle(event.target.value)}
                />
                <button type="button" className={styles.btnPrimary} onClick={saveTitle}>
                  保存标题
                </button>
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>老板键</h3>
              <p className={styles.sectionDesc}>按下快捷键后执行下方选择的伪装动作。</p>
              <div className={styles.segmented} role="group" aria-label="老板键动作">
                <button
                  type="button"
                  className={bossKeyAction === 'regional-sales' ? styles.segmentActive : ''}
                  onClick={() => handleBossKeyActionChange('regional-sales')}
                >
                  区域销售
                </button>
                <button
                  type="button"
                  className={bossKeyAction === 'custom-image' ? styles.segmentActive : ''}
                  onClick={() => handleBossKeyActionChange('custom-image')}
                >
                  自定义图片
                </button>
              </div>

              {bossKeyAction === 'regional-sales' ? (
                <div className={styles.infoPanel}>
                  <p>
                    按下 <strong>{formatBossKeyShortcut(bossKeyShortcut)}</strong> 切换到「区域销售」Sheet，并同步伪装标题。
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.infoPanel}>
                    <p>
                      按下 <strong>{formatBossKeyShortcut(bossKeyShortcut)}</strong> 全屏显示图片；再次按下相同快捷键才关闭。
                    </p>
                    <p>点击图片、切换 Sheet 或按 Esc 均不会关闭。图片仅保存在本机浏览器，不上传服务器。</p>
                  </div>
                  <div className={styles.specCard}>
                    <span className={styles.specLabel}>上传规格（与当前窗口一致）</span>
                    <span className={styles.specValue}>
                      {formatBossKeyTargetSize(targetSize)} · JPG/PNG/WebP · ≤
                      {Math.round(BOSS_KEY_IMAGE_MAX_BYTES / 1024 / 1024)}MB
                    </span>
                  </div>
                  <div className={styles.actionRow}>
                    <button type="button" className={styles.btn} onClick={() => fileInputRef.current?.click()}>
                      上传图片
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(event) => void handleImageUpload(event)}
                    />
                    {imagePreviewUrl && (
                      <>
                        <button type="button" className={styles.btn} onClick={() => void handleRecropStoredImage()}>
                          重新裁剪
                        </button>
                        <button type="button" className={styles.btn} onClick={() => void handleClearImage()}>
                          清除图片
                        </button>
                      </>
                    )}
                  </div>
                  {imagePreviewUrl && (
                    <div className={styles.previewCard}>
                      <img className={styles.previewImage} src={imagePreviewUrl} alt="老板键图片预览" />
                      {storedMeta && (
                        <p className={styles.previewMeta}>
                          已保存规格：{formatBossKeyTargetSize(storedMeta)}
                          {viewportMismatch && ' · 窗口尺寸已变化，建议重新裁剪'}
                        </p>
                      )}
                      {!storedMeta && (
                        <p className={styles.previewMeta}>规格未知，请重新裁剪以确保全屏铺满。</p>
                      )}
                    </div>
                  )}
                  {imageHint && <p className={styles.hint}>{imageHint}</p>}
                </>
              )}

              <div className={styles.footerActions}>
                <button
                  type="button"
                  className={recordingBossKey ? styles.btnRecording : styles.btn}
                  onClick={() => setRecordingBossKey(true)}
                >
                  {recordingBossKey ? '请按下快捷键…' : `快捷键：${formatBossKeyShortcut(bossKeyShortcut)}`}
                </button>
                {bossKeyAction === 'regional-sales' && (
                  <button type="button" className={styles.btn} onClick={previewBossTitle}>
                    预览伪装标题
                  </button>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>默认创建游戏</h3>
              <p className={styles.sectionDesc}>功能区里的「创建房间」会使用这里选择的游戏。</p>
              <div className={styles.segmented} role="group" aria-label="默认创建游戏">
                <button
                  type="button"
                  className={defaultGameType === 'sanguosha' ? styles.segmentActive : ''}
                  onClick={() => onDefaultGameTypeChange('sanguosha')}
                >
                  三国杀
                </button>
                <button
                  type="button"
                  className={defaultGameType === 'monopoly' ? styles.segmentActive : ''}
                  onClick={() => onDefaultGameTypeChange('monopoly')}
                >
                  大富翁
                </button>
              </div>
            </section>

            {SHOW_APPEARANCE_SETTINGS && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>外观</h3>
                <label className={styles.sectionDesc}>
                  背景色
                  <select
                    value={bgColorToken}
                    onChange={(event) => onBgColorTokenChange(event.target.value)}
                  >
                    {BG_COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}
          </div>
        </div>
      </div>

      {cropSourceUrl && (
        <BossKeyImageCropDialog
          open
          imageUrl={cropSourceUrl}
          targetSize={targetSize}
          onConfirm={(blob, savedTarget) => void handleCropConfirm(blob, savedTarget)}
          onCancel={revokeCropSourceUrl}
        />
      )}
    </>
  );
}
