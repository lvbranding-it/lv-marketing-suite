# Advisor voice

Browser speech recognition fills the existing composer; the user reviews and sends the text through the existing protected advisor endpoint. Recognition uses the selected English/Spanish locale. Browser microphone permission is requested only on clicking Speak message. The UI explains that a browser speech provider may process audio. No audio file is stored by this application.

Speech synthesis provides per-response Read aloud and opt-in automatic reading. Stop reading cancels playback. Starting dictation stops playback to avoid transcription feedback. Navigation away from the advisor, hiding the page, changing language and starting a new conversation stop voice activity. Text input remains available when recognition is unsupported.

Deploy the frontend to activate. No migration, Edge Function update or new key is required. Browser support, installed voices, microphone permission and autoplay policy affect availability. Test microphone capture and speaker playback on the intended real devices after deployment; mocked browser tests cannot certify audio hardware or provider behavior.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
