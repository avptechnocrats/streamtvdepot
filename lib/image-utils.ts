/**
 * Compress image before converting to base64
 * Reduces file size while maintaining acceptable quality for profile pictures
 */
export async function compressImage(
    file: File,
    maxWidth: number = 400,
    maxHeight: number = 400,
    quality: number = 0.8
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions maintaining aspect ratio
                if (width > maxWidth || height > maxHeight) {
                    const aspectRatio = width / height;
                    if (width > height) {
                        width = maxWidth;
                        height = Math.round(maxWidth / aspectRatio);
                    } else {
                        height = maxHeight;
                        width = Math.round(maxHeight * aspectRatio);
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Failed to get canvas context"));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to base64 with quality
                try {
                    const base64 = canvas.toDataURL("image/jpeg", quality);
                    resolve(base64);
                } catch (err) {
                    reject(err);
                }
            };

            img.onerror = () => {
                reject(new Error("Failed to load image"));
            };

            img.src = e.target?.result as string;
        };

        reader.onerror = () => {
            reject(new Error("Failed to read file"));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Calculate base64 string size in KB
 */
export function getBase64SizeKB(base64String: string): number {
    return Math.round((base64String.length * 3) / 4 / 1024);
}
