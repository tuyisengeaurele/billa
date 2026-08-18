export async function removeBackground(buffer: Buffer): Promise<Buffer> {
  const serviceUrl = process.env.REMBG_SERVICE_URL;
  if (!serviceUrl) {
    throw new Error("REMBG_SERVICE_URL is not set");
  }

  const response = await fetch(serviceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`rembg service returned ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
