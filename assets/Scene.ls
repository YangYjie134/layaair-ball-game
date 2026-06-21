{
  "_$ver": 1,
  "_$id": "lx8mwule",
  "_$type": "Scene",
  "left": 0,
  "right": 0,
  "top": 0,
  "bottom": 0,
  "name": "Scene2D",
  "width": 1334,
  "height": 750,
  "_$comp": [
    {
      "_$type": "7bad1742-6eed-4d8d-81c0-501dc5bf03d6",
      "scriptPath": "../src/Main.ts"
    }
  ],
  "_$child": [
    {
      "_$id": "4j74okeh",
      "_$type": "Sprite",
      "name": "Ball",
      "x": 400,
      "y": 520,
      "width": 10,
      "height": 10,
      "_gcmds": [
        {
          "_$type": "DrawCircleCmd",
          "x": 0,
          "y": 0,
          "radius": 5,
          "lineWidth": 1,
          "lineColor": "#000000",
          "fillColor": "#ff0000"
        }
      ],
      "_$comp": [
        {
          "_$type": "d4b4b3c0-f760-43b9-83d3-3a9bbd8f8157",
          "scriptPath": "../src/BallController.ts"
        }
      ]
    },
    {
      "_$id": "e597awwz",
      "_$type": "Sprite",
      "name": "Platform_1",
      "x": 70,
      "y": 552,
      "width": 200,
      "height": 1,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "c3ucvuzv",
      "_$type": "Sprite",
      "name": "Platform_2",
      "x": 280,
      "y": 409,
      "width": 200,
      "height": 1,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "mnf4tb5z",
      "_$type": "Sprite",
      "name": "Platform_3",
      "x": 649,
      "y": 326,
      "width": 200,
      "height": 1,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "lfpadmuv",
      "_$type": "Sprite",
      "name": "Platform_4",
      "x": 272,
      "y": 221,
      "width": 200,
      "height": 1,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "oegiihaf",
      "_$type": "Sprite",
      "name": "Platform_5",
      "x": 536,
      "y": 113,
      "width": 200,
      "height": 1,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "xfk4o9wu",
      "_$type": "Sprite",
      "name": "top wall",
      "width": 1334,
      "height": 30,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "2e25cuk8",
      "_$type": "Sprite",
      "name": "left wall",
      "x": 30,
      "width": 1334,
      "height": 30,
      "rotation": 90,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "3pa81r5g",
      "_$type": "Sprite",
      "name": "right wall",
      "x": 1334,
      "width": 1334,
      "height": 30,
      "rotation": 90,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "5wht9rsm",
      "_$type": "Sprite",
      "name": "Ground",
      "y": 720,
      "width": 1334,
      "height": 30,
      "_gcmds": [
        {
          "_$type": "DrawRectCmd",
          "lineWidth": 1,
          "fillColor": "#ffffff"
        }
      ]
    },
    {
      "_$id": "ytam2rhd",
      "_$type": "Sprite",
      "name": "Background",
      "width": 1334,
      "height": 750
    }
  ]
}