import { useEffect, useState } from 'react';
import { cookieUtils } from '../utils/cookie';

export function useUserData() {
  const [userData, setUserData] = useState({
    walletAddress: null,
    telegramId: null,
    telegramUsername: null,
    isTelegram: false
  });

  // ذخیره اطلاعات در کوکی
  const saveUserData = (data) => {
    const newData = { ...userData, ...data };
    setUserData(newData);
    cookieUtils.setCookie('user_data', newData);
  };

  // بارگذاری اطلاعات از کوکی
  const loadUserData = () => {
    const saved = cookieUtils.getCookie('user_data');
    if (saved) {
      setUserData(saved);
      return saved;
    }
    return null;
  };

  // پاک کردن اطلاعات
  const clearUserData = () => {
    setUserData({
      walletAddress: null,
      telegramId: null,
      telegramUsername: null,
      isTelegram: false
    });
    cookieUtils.deleteCookie('user_data');
  };

  // بررسی وجود اطلاعات
  const hasUserData = () => {
    return cookieUtils.hasCookie('user_data');
  };

  return {
    userData,
    saveUserData,
    loadUserData,
    clearUserData,
    hasUserData
  };
}