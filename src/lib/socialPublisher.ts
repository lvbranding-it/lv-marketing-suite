import { instagramRatioProblem, type MediaSize } from "./socialMedia";

export type SocialPlatform = "facebook" | "instagram";
export type SocialWorkflowStatus =
  | "draft" | "in_review" | "changes_requested" | "approved" | "scheduled"
  | "publishing" | "published" | "partially_published" | "failed" | "canceled"
  | "connection_required";

export const SOCIAL_STATUS_META: Record<SocialWorkflowStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  in_review: { label: "In review", className: "bg-amber-50 text-amber-700 border-amber-200" },
  changes_requested: { label: "Changes requested", className: "bg-orange-50 text-orange-700 border-orange-200" },
  approved: { label: "Approved", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-700 border-blue-200" },
  publishing: { label: "Publishing", className: "bg-violet-50 text-violet-700 border-violet-200" },
  published: { label: "Published", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partially_published: { label: "Partially published", className: "bg-amber-50 text-amber-700 border-amber-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
  canceled: { label: "Canceled", className: "bg-slate-100 text-slate-500 border-slate-200" },
  connection_required: { label: "Connection required", className: "bg-red-50 text-red-700 border-red-200" },
};

export const META_PERMISSIONS = [
  { scope: "pages_show_list", reason: "Find the Facebook Pages you manage" },
  { scope: "pages_read_engagement", reason: "Verify Page access and published results" },
  { scope: "pages_manage_posts", reason: "Publish posts to selected Facebook Pages" },
  { scope: "instagram_basic", reason: "Identify linked professional Instagram accounts" },
  { scope: "instagram_content_publish", reason: "Publish approved Instagram content" },
  { scope: "business_management", reason: "Discover eligible business assets" },
  { scope: "ads_management", reason: "Required by Meta to publish to Instagram when Page access comes through a Business Portfolio" },
  { scope: "ads_read", reason: "Required by Meta alongside ads_management for that Instagram publishing" },
];

/**
 * How far ahead a post must be scheduled. The database refuses anything within
 * a minute of now; the extra minute covers the time saving takes.
 */
export const MIN_SCHEDULE_LEAD_MINUTES = 2;

/** Minutes from now until a time written in the workspace's time zone, or -Infinity if it is not a time. */
export function minutesUntil(localValue: string, timeZone: string, now = Date.now()) {
  try {
    return (Date.parse(zonedDateTimeToUtc(localValue, timeZone)) - now) / 60_000;
  } catch {
    return -Infinity;
  }
}

/**
 * The formats that fit the media: a single video is a Facebook video and an
 * Instagram Reel, several files are an Instagram carousel. A Facebook text or
 * link post stays one. A video left as "Image" used to reach Facebook's photo
 * endpoint and fail at publishing time.
 */
export function formatsForMedia(files: Pick<File, "type">[], current: { facebook: string; instagram: string }) {
  if (!files.length) return current;
  const singleVideo = files.length === 1 && files[0].type.startsWith("video/");
  return {
    facebook: ["image", "video"].includes(current.facebook) ? (singleVideo ? "video" : "image") : current.facebook,
    instagram: files.length > 1 ? "carousel" : singleVideo ? "reel" : "image",
  };
}

export function validateSocialDraft(input: {
  title: string;
  accountIds: string[];
  captions: Partial<Record<SocialPlatform, string>>;
  formats: Partial<Record<SocialPlatform, string>>;
  files: File[];
  /** Each file's width and height, in the same order, once read. */
  sizes?: (MediaSize | undefined)[];
  scheduledLocal?: string;
  /** The workspace time zone the scheduled time is written in. */
  timezone?: string;
}) {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("Add an internal title.");
  if (!input.accountIds.length) errors.push("Select at least one destination.");
  if (input.scheduledLocal) {
    const minutes = input.timezone
      ? minutesUntil(input.scheduledLocal, input.timezone)
      : (new Date(input.scheduledLocal).getTime() - Date.now()) / 60_000;
    if (!(minutes >= MIN_SCHEDULE_LEAD_MINUTES)) errors.push(`Choose a publishing time at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes from now.`);
  }
  const hasVideo = input.files.some((file) => file.type.startsWith("video/"));
  const hasImage = input.files.some((file) => file.type.startsWith("image/"));
  for (const platform of ["facebook", "instagram"] as const) {
    if (!input.formats[platform]) continue;
    const format = input.formats[platform];
    if (!input.captions[platform]?.trim() && (platform === "instagram" || ["text", "link"].includes(format))) {
      errors.push(`Add a ${platform === "facebook" ? "Facebook" : "Instagram"} caption.`);
    }
    if (["image", "video", "carousel", "reel"].includes(format) && !input.files.length) {
      errors.push(`Add media for the ${platform === "facebook" ? "Facebook" : "Instagram"} version.`);
    }
    const caption = input.captions[platform] || "";
    if (platform === "instagram" && caption.length > 2_200) errors.push("Instagram captions cannot exceed 2,200 characters.");
    if (platform === "instagram" && (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length > 30) errors.push("Instagram captions can contain at most 30 hashtags.");
    if (platform === "facebook" && caption.length > 63_206) errors.push("Facebook captions cannot exceed 63,206 characters.");
    if (platform === "facebook" && format === "image" && hasVideo) errors.push("The Facebook version is set to Image, but the media is a video. Choose Video.");
    if (platform === "facebook" && format === "video" && hasImage) errors.push("The Facebook version is set to Video, but the media is an image. Choose Image.");
    if (platform === "instagram" && format === "image" && hasVideo) errors.push("The Instagram version is set to Feed image, but the media is a video. Choose Reel.");
    if (["image", "video", "reel"].includes(format) && input.files.length > 1) {
      errors.push(platform === "facebook"
        ? "A Facebook post here takes one image or video. Remove the others, or send the carousel to Instagram only."
        : format === "reel" ? "A Reel takes one video." : "An Instagram feed image takes one file. Choose Carousel for 2 to 10.");
    }
    if (format === "carousel" && (input.files.length < 2 || input.files.length > 10)) errors.push("Instagram carousels require 2–10 media files.");
    if (format === "reel" && !input.files.some((file) => file.type.startsWith("video/"))) errors.push("Instagram Reels require a video.");
    // PNG and WebP images get a JPEG copy for Instagram when the post is saved,
    // and Meta takes MOV as well as MP4, so neither is refused here. The shape
    // of a feed image cannot be fixed without cropping it, so that is.
    if (platform === "instagram" && ["image", "carousel"].includes(format)) {
      input.files.forEach((file, index) => {
        const size = input.sizes?.[index];
        const problem = file.type.startsWith("image/") && size ? instagramRatioProblem(size, file.name) : null;
        if (problem) errors.push(problem);
      });
    }
  }
  for (const file of input.files) {
    if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(file.type)) {
      errors.push(`${file.name} is not a supported image or video.`);
    }
    if (file.size > 100 * 1024 * 1024) errors.push(`${file.name} exceeds the 100 MB upload limit.`);
  }
  return [...new Set(errors)];
}

function timeZoneOffset(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = value.hour === "24" ? 0 : Number(value.hour);
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), hour, Number(value.minute), Number(value.second)) - at.getTime();
}

export function zonedDateTimeToUtc(localValue: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) throw new Error("Invalid scheduled time");
  const [, year, month, day, hour, minute] = match;
  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let result = guess - timeZoneOffset(new Date(guess), timeZone);
  result = guess - timeZoneOffset(new Date(result), timeZone);
  return new Date(result).toISOString();
}

export function formatSocialDate(value: string, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    ...options,
  }).format(new Date(value));
}

/** A time to schedule for, `minutesAhead` from now, rounded up to the next `step` minutes. */
export function defaultScheduleValue(minutesAhead = 60, step = 15) {
  const date = new Date(Date.now() + minutesAhead * 60_000);
  date.setMinutes(Math.ceil((date.getMinutes() + (date.getSeconds() ? 1 : 0)) / step) * step, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
