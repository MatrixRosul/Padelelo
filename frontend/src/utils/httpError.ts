import axios from 'axios';

export function toUserFriendlyError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot connect to server. Check backend and network.';
    }

    const status = error.response.status;

    if (status === 401 || status === 403) {
      return 'Session expired. Sign in again.';
    }

    if (status === 404) {
      return 'Data not found.';
    }

    const responseMessage = error.response.data?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim().length > 0) {
      return responseMessage;
    }

    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      return responseMessage.join(', ');
    }

    return fallback;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
