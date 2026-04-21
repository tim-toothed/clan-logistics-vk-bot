import { listMainAdminUsers } from "../db/users-repository.js";
import { sendTemplateSequence } from "./vk-message.js";

export async function deliverParticipantContentWithAdminLog(context, delivery) {
  const recipients = Array.isArray(delivery?.recipients) ? delivery.recipients.filter((item) => item?.peerId) : [];
  const contentItems = Array.isArray(delivery?.contentItems) ? delivery.contentItems : [];
  const keyboard = delivery?.keyboard;
  const results = [];

  for (const recipient of recipients) {
    try {
      await sendTemplateSequence(context.vk, recipient.peerId, contentItems, { keyboard });
      results.push({
        ...recipient,
        success: true,
        errorMessage: null,
      });
    } catch (error) {
      results.push({
        ...recipient,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = buildDeliveryReport(delivery, results);
  await notifyMainAdminsAboutDelivery(context, report);
  return report;
}

export function formatDeliveryContentForManualRelay(contentItems) {
  const items = Array.isArray(contentItems) ? contentItems : [];

  if (!items.length) {
    return "Сообщение для участников пустое.";
  }

  return items
    .map((item, index) => {
      const text = typeof item?.text === "string" && item.text.trim() ? item.text.trim() : "(без текста)";
      const attachments = Array.isArray(item?.attachments) ? item.attachments.map((attachment) => attachment?.vk_attachment).filter(Boolean) : [];
      const attachmentLine = attachments.length ? `\nВложения: ${attachments.join(", ")}` : "";
      return `Сообщение ${index + 1}:\n${text}${attachmentLine}`;
    })
    .join("\n\n");
}

function buildDeliveryReport(delivery, results) {
  const successfulRecipients = results.filter((item) => item.success);
  const failedRecipients = results.filter((item) => !item.success);

  return {
    ok: failedRecipients.length === 0,
    delivery,
    results,
    successfulRecipients,
    failedRecipients,
  };
}

async function notifyMainAdminsAboutDelivery(context, report) {
  const mainAdmins = await listMainAdminUsers(context.env);

  if (!mainAdmins.length) {
    return;
  }

  const message = formatDeliveryAdminMessage(report);

  for (const admin of mainAdmins) {
    try {
      await context.vk.sendText(admin.peerId, message);
    } catch (error) {
      console.error("Failed to send delivery log to main admin", error, {
        adminPeerId: admin.peerId,
        deliveryLabel: report.delivery?.label ?? null,
      });
    }
  }
}

function formatDeliveryAdminMessage(report) {
  const { delivery, successfulRecipients, failedRecipients } = report;
  const hasNoRecipients = report.results.length === 0;
  const statusIcon = failedRecipients.length || hasNoRecipients ? "🔴" : "🟢";
  const stationLabel = delivery?.stationName ? `\nСтанция: ${delivery.stationName}` : "";
  const teamLabel = delivery?.teamName ? `\nКоманда: ${delivery.teamName}` : "";
  const initiatedByLabel = delivery?.initiatedByName
    ? `\nИсточник: ${formatPersonLink(delivery.initiatedByName, delivery.initiatedByPeerId)}`
    : "";
  const successLine = successfulRecipients.length
    ? `\nДоставлено: ${successfulRecipients.map(formatRecipientResult).join(" | ")}`
    : "\nДоставлено: никому";
  const failedLine = failedRecipients.length
    ? `\nОшибка: ${failedRecipients.map(formatRecipientFailure).join("; ")}`
    : hasNoRecipients
      ? "\nОшибка: нет"
      : "";

  return `${statusIcon} ${delivery?.label ?? "Доставка участникам"}${teamLabel}${stationLabel}${initiatedByLabel}${successLine}${failedLine}`;
}

function formatRecipientResult(recipient) {
  return formatPersonLink(recipient.displayName, recipient.vkUserId ?? recipient.peerId);
}

function formatRecipientFailure(recipient) {
  return `${formatPersonLink(recipient.displayName, recipient.vkUserId ?? recipient.peerId)} - ${recipient.errorMessage ?? "неизвестная ошибка"}`;
}

function formatPersonLink(displayName, vkUserId) {
  if (!vkUserId) {
    return displayName;
  }

  return `[${displayName}](https://vk.com/im/convo/${vkUserId})`;
}
