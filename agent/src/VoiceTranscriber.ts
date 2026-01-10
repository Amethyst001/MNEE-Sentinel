import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * @title VoiceTranscriber
 * @notice Production-grade multi-engine voice transcription with confidence voting.
 *         Now with High Availability (7-Key Rotation) for Gemini.
 */
export class VoiceTranscriber {
    private azureKey: string;
    private azureRegion: string;
    private geminiModels: any[] = [];
    private currentModelIndex: number = 0;

    constructor() {
        this.azureKey = process.env.AZURE_SPEECH_KEY || '';
        this.azureRegion = process.env.AZURE_SPEECH_REGION || 'southafricanorth';

        // Auto-Discover All Gemini Keys for Rotation
        const keys = [
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_1,
            process.env.GEMINI_API_KEY_2,
            process.env.GEMINI_API_KEY_3,
            process.env.GEMINI_API_KEY_4,
            process.env.GEMINI_API_KEY_5,
            process.env.GEMINI_API_KEY_6
        ].filter(k => !!k && k !== 'dummy_key') as string[];

        console.log(`🎤 VoiceTranscriber initialized with ${keys.length} Gemini Keys.`);

        keys.forEach(key => {
            const genAI = new GoogleGenerativeAI(key);
            this.geminiModels.push(genAI.getGenerativeModel({ model: "gemini-2.5-flash" }));
        });
    }

    /**
     * Transcribes audio using multiple engines and returns the best result.
     * @param audioBuffer The audio file buffer
     * @param mimeType The audio MIME type (e.g., 'audio/ogg')
     */
    async transcribe(audioBuffer: Buffer, mimeType: string): Promise<{ text: string, confidence: number, engine: string }> {
        const results: { text: string, confidence: number, engine: string }[] = [];

        // 1. Try Azure Speech-to-Text
        try {
            const azureResult = await this.transcribeWithAzure(audioBuffer, mimeType);
            if (azureResult.text) {
                azureResult.text = this.sanitize(azureResult.text);
                results.push(azureResult);
                console.log(`🎤 Azure Candidate: "${azureResult.text}" (${azureResult.confidence}% confidence)`);
            }
        } catch (error: any) {
            console.log("⚠️ Azure transcription failed:", error.message);
        }

        // 2. Try Gemini
        try {
            const geminiResult = await this.transcribeWithGemini(audioBuffer, mimeType);
            if (geminiResult.text) {
                geminiResult.text = this.sanitize(geminiResult.text);
                results.push(geminiResult);
                console.log(`🤖 Gemini Candidate: "${geminiResult.text}" (${geminiResult.confidence}% confidence)`);
            }
        } catch (error: any) {
            console.log("⚠️ Gemini transcription failed:", error.message);
        }

        // If no results, return error
        if (results.length === 0) {
            return { text: '', confidence: 0, engine: 'none' };
        }

        // Context Boost: Prioritize results that mention "MNEE"
        results.forEach(r => {
            if (r.text.toUpperCase().includes("MNEE")) {
                r.confidence = Math.min(r.confidence + 20, 100);
                console.log(`🚀 Context Boost applied to ${r.engine} (Confidence: ${r.confidence}%)`);
            }
        });

        // Pick the best result by confidence
        results.sort((a, b) => b.confidence - a.confidence);
        const best = results[0];

        console.log(`✅ Selected: ${best.engine} with ${best.confidence}% confidence`);
        return best;
    }

    private sanitize(text: string): string {
        return text
            .replace(/men EE/gi, 'MNEE')
            .replace(/MI need/gi, 'MNEE')
            .replace(/MNE\./gi, 'MNEE')
            .replace(/MNE /gi, 'MNEE ')
            .replace(/minutes/gi, 'MNEE')
            .replace(/money/gi, 'MNEE')
            .replace(/many/gi, 'MNEE')
            .replace(/mini/gi, 'MNEE')
            .replace(/\.$/, '')
            .trim();
    }

    /**
     * Azure Cognitive Services Speech-to-Text
     */
    private async transcribeWithAzure(audioBuffer: Buffer, mimeType: string): Promise<{ text: string, confidence: number, engine: string }> {
        if (!this.azureKey) {
            console.warn("⚠️ Voice Transcriber: AZURE_SPEECH_KEY is missing. Falling back to Gemini.");
            throw new Error("Azure key not configured");
        }

        // Map common audio formats to Azure-compatible Content-Types
        let contentType = 'audio/ogg; codecs=opus'; // Default for Telegram
        if (mimeType.includes('webm')) {
            contentType = 'audio/webm; codecs=opus';
        } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
            contentType = 'audio/mp4';
        } else if (mimeType.includes('wav')) {
            contentType = 'audio/wav';
        } else if (mimeType.includes('ogg')) {
            contentType = 'audio/ogg; codecs=opus';
        }

        console.log(`🎤 Azure: Using Content-Type: ${contentType} (from mime: ${mimeType})`);

        const endpoint = `https://${this.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

        const response = await axios.post(endpoint, audioBuffer, {
            headers: {
                'Ocp-Apim-Subscription-Key': this.azureKey,
                'Content-Type': contentType,
                'Accept': 'application/json'
            },
            params: {
                language: 'en-US'
            }
        });

        if (response.data.RecognitionStatus === 'Success') {
            return {
                text: response.data.DisplayText,
                confidence: Math.round(response.data.NBest?.[0]?.Confidence * 100) || 85,
                engine: 'Azure'
            };
        }

        throw new Error(`Azure returned: ${response.data.RecognitionStatus}`);
    }

    /**
     * Gemini Audio Transcription with RETRY & ROTATION
     */
    private async transcribeWithGemini(audioBuffer: Buffer, mimeType: string, retries = 14): Promise<{ text: string, confidence: number, engine: string }> {
        if (this.geminiModels.length === 0) {
            throw new Error("Gemini not configured");
        }

        // Convert buffer to base64
        const base64Audio = audioBuffer.toString('base64');
        const payload = [
            { inlineData: { mimeType: mimeType, data: base64Audio } },
            { text: "Transcribe this audio exactly. Return ONLY the spoken text, nothing else." }
        ];

        for (let i = 0; i < retries; i++) {
            try {
                // Use current model
                const model = this.geminiModels[this.currentModelIndex];
                const result = await model.generateContent(payload);
                const text = result.response.text().trim();
                const confidence = this.estimateConfidence(text);

                return {
                    text: text,
                    confidence: confidence,
                    engine: 'Gemini'
                };

            } catch (error: any) {
                const isRateLimit = error.message?.includes('429') || error.status === 429;

                if (isRateLimit && i < retries - 1 && this.geminiModels.length > 1) {
                    // Rotate
                    this.currentModelIndex = (this.currentModelIndex + 1) % this.geminiModels.length;
                    console.warn(`📉 Voice Rate Limit (429). Rotating to Model Index ${this.currentModelIndex} (Key ${Math.ceil((this.currentModelIndex + 1) / 1)})...`);
                    // Retry immediately (next loop iteration uses new index)
                } else if (i < retries - 1) {
                    // Standard delay
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    throw error;
                }
            }
        }
        throw new Error("Max retries exceeded");
    }

    /**
     * Heuristic confidence estimation
     */
    private estimateConfidence(text: string): number {
        if (!text || text.length < 5) return 20;

        // Check for common payment-related keywords
        const paymentKeywords = ['pay', 'mnee', 'send', 'transfer', 'to', 'for'];
        const foundKeywords = paymentKeywords.filter(k => text.toLowerCase().includes(k)).length;

        // Base confidence + keyword bonus
        const baseConfidence = 70;
        const keywordBonus = foundKeywords * 5;

        return Math.min(95, baseConfidence + keywordBonus);
    }
}
