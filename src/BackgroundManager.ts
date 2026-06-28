declare var Laya: any;

// 背景管理器：负责在场景初始化时统一绘制背景与星空装饰
export class BackgroundManager {
    // 画布宽度用于统一背景尺寸，避免不同分辨率下出现拉伸
    private static readonly width: number = 1334;
    // 画布高度用于统一背景尺寸，确保背景与场景比例保持一致
    private static readonly height: number = 750;

    // 绘制背景的公共方法
    public static draw(sceneRoot: any): void {
        // 调试日志：确认背景绘制流程已经执行
        console.log("BackgroundManager draw called");
        // 查找Scene2D节点
        const scene2D = BackgroundManager.findScene2D(sceneRoot);

        // 如果未找到Scene2D节点，则输出警告并返回
        if (!scene2D) {
            console.warn("BackgroundManager: Scene2D node not found.");
            return;
        }

        // 从Scene2D中获取Background子节点
        const background = scene2D.getChildByName("Background");

        // 如果Background节点不存在，输出警告并返回
        if (!background) {
            console.warn("BackgroundManager: Background node not found under Scene2D.");
            return;
        }
        console.log("Background found:", background.name);
        // 设置背景的z层级（最后面）
        background.zOrder = -100;
        // 设置背景位置和大小
        background.x = 0;
        background.y = 0;
        background.width = BackgroundManager.width;
        background.height = BackgroundManager.height;
        // 禁用鼠标交互
        background.mouseEnabled = false;

        // 绘制背景图形
        if (background.graphics) {
            // 清空之前的绘制内容
            background.graphics.clear();
            // 绘制深蓝色背景矩形
            background.graphics.drawRect(0, 0, BackgroundManager.width, BackgroundManager.height, "#06142d");
            // 绘制星星装饰
            BackgroundManager.drawStars(background.graphics);
        } else {
            console.warn("BackgroundManager: Background node has no graphics object.");
        }
    }

    // 寻找Scene2D节点，支持多种查找方式
    private static findScene2D(sceneRoot: any): any {
        // 直接检查sceneRoot是否为Scene2D
        if (sceneRoot && sceneRoot.name === "Scene2D") {
            return sceneRoot;
        }

        // 尝试从sceneRoot的子节点中获取Scene2D
        if (sceneRoot && sceneRoot.getChildByName) {
            const scene2D = sceneRoot.getChildByName("Scene2D");
            if (scene2D) {
                return scene2D;
            }
        }

        // 检查sceneRoot的scene属性
        if (sceneRoot && sceneRoot.scene && sceneRoot.scene.name === "Scene2D") {
            return sceneRoot.scene;
        }

        // 从Laya舞台中获取Scene2D
        if (Laya.stage && Laya.stage.getChildByName) {
            return Laya.stage.getChildByName("Scene2D");
        }

        // 未找到返回null
        return null;
    }

    // 绘制背景星星
    private static drawStars(graphics: any): void {
        // 星星数据以固定坐标和颜色预设呈现，便于保持背景效果稳定
        const stars: Array<{ x: number; y: number; radius: number; color: string }> = [
            { x: 56, y: 48, radius: 1.5, color: "#ffffff" },
            { x: 128, y: 92, radius: 1, color: "#dcecff" },
            { x: 224, y: 38, radius: 1.2, color: "#ffffff" },
            { x: 318, y: 116, radius: 1, color: "#b9d7ff" },
            { x: 432, y: 64, radius: 1.4, color: "#ffffff" },
            { x: 548, y: 142, radius: 1, color: "#dcecff" },
            { x: 672, y: 72, radius: 1.3, color: "#ffffff" },
            { x: 744, y: 174, radius: 1, color: "#b9d7ff" },
            { x: 86, y: 216, radius: 1, color: "#dcecff" },
            { x: 278, y: 248, radius: 1.5, color: "#ffffff" },
            { x: 482, y: 228, radius: 1, color: "#b9d7ff" },
            { x: 618, y: 294, radius: 1.2, color: "#ffffff" },
            { x: 724, y: 344, radius: 1, color: "#dcecff" },
        ];

        // 遍历每个星星数据，绘制圆形
        for (const star of stars) {
            graphics.drawCircle(star.x, star.y, star.radius, star.color);
        }
    }
}
