export type PackStatus = {
    ready: boolean;
    version?: string;
    at?: string;
    totalBytes?: number;
    files?: number;
    reason?: string;
};
export async function offlineAction(type: "VERIFY" | "DOWNLOAD", progress: (text: string) => void): Promise<PackStatus> {
    if (!("serviceWorker" in navigator) || !window.isSecureContext)
        throw new Error("请使用 HTTPS 网站和支持离线的普通浏览器");
    const registration = await navigator.serviceWorker.getRegistration(new URL("./", location.href).href);
    if (!registration?.active)
        throw new Error("离线服务尚未就绪，请刷新后重试；开发预览不提供离线包");
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error("离线检查或下载超时，请重试")); }, 180000);
        channel.port1.onmessage = ({ data }) => { if (data.done) {
            clearTimeout(timer);
            channel.port1.close();
            if (data.error)
                reject(new Error(data.error));
            else
                resolve(data.result);
        }
        else
            progress(`正在${type === "DOWNLOAD" ? "下载" : "核对"} ${data.progress}/${data.total} 个文件`); };
        registration.active!.postMessage({ type }, [channel.port2]);
    });
}
