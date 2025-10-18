// models/whisper-tiny.js
window.WhisperTiny = {
  init: async (modelPath) => {
    console.log("WhisperTiny: טוען מודל מ:", modelPath);
    // כרגע רק הדמיה (לא מודל אמיתי)
    return {
      transcribe: async (file) => {
        console.log("WhisperTiny: מריץ תמלול על", file.name);
        // החזרת תמלול מדומה לבדיקה
        return {
          text: "זהו תמלול דוגמה מתוך Whisper Tiny (בדוק שהחיבור פועל).",
          segments: [
            { start: 0, end: 2, text: "זהו תמלול" },
            { start: 2, end: 4, text: "בדיקה מקומית" },
            { start: 4, end: 6, text: "של Whisper Tiny" }
          ]
        };
      }
    };
  }
};
