import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Map, Marker, Popup, TileLayer, Polyline, Polygon } from 'react-leaflet'
import { Fab } from '@material-ui/core'
import PanToolIcon from '@material-ui/icons/PanTool'
import TouchAppIcon from '@material-ui/icons/TouchApp'
import { makeStyles, createStyles } from '@material-ui/core/styles'
import convexhull from 'monotone-convex-hull-2d'

import type { FC } from 'react'
import type { Theme } from '@material-ui/core/styles'
import { LeafletMouseEvent } from 'leaflet'
import type { Estate, Coordinate } from 'types'

type Mode = 'drag' | 'nazotte'
type LeafletEventCallback = (event: LeafletMouseEvent) => void
type Vertex = [number, number]

interface Props {
  center: Coordinate
  zoom: number
  onNazotteEnd?: (positions: Position[]) => void
}

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    map: {
      width: '100%',
      height: '100%',
      zIndex: 0
    },
    fab: {
      position: 'fixed',
      bottom: theme.spacing(4),
      left: '50vw',
      transform: 'translateX(-50%)',
      zIndex: 1
    }
  })
)

const EstateMarker: FC<{ estate: Estate }> = ({ estate }) => (
  <Marker position={[estate.latitude, estate.longitude]}>
    <Popup>
      <Link href={`/estate/detail?id=${estate.id}`}>
        <a> {estate.name} </a>
      </Link>
    </Popup>
  </Marker>
)

export const NazzoteMap: FC<Props> = ({ center, zoom, ...props }) => {
  const classes = useStyles()
  const [mode, setMode] = useState<Mode>('drag')
  const [vertexes, setVertexes] = useState<Vertex[]>([])
  const [isDragging, setDragging] = useState<boolean>(false)
  const [resultEstates, setResultEstates] = useState<Estate[]>([])

  const onNazotteStart = useCallback<LeafletEventCallback>(
    ({ latlng }) => {
      if (mode !== 'nazotte') return
      setVertexes(() => [[latlng.lat, latlng.lng]])
      setDragging(true)
      setResultEstates(() => [])
    },
    [mode]
  )

  const onNazotte = useCallback<LeafletEventCallback>(
    ({ latlng }) => {
      if (mode !== 'nazotte' || !isDragging) return
      setVertexes((vertexes) => [...vertexes, [latlng.lat, latlng.lng]])
    },
    [mode, isDragging]
  )

  const onNazotteEnd = useCallback<LeafletEventCallback>(
    ({ latlng }) => {
      if (mode !== 'nazotte') return
      const figuresIndexes = convexhull([...vertexes, [latlng.lat, latlng.lng]])
      const figures = [
        ...figuresIndexes.map((index) => vertexes[index]),
        vertexes[figuresIndexes[0]]
      ].filter((vertex) => vertex)

      setDragging(false)
      console.log('onNazotteEnd')

      fetch('/api/estate/nazotte', {
        method: 'POST',
        mode: 'cors',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coordinates: figures.map(([latitude, longitude]) => ({ latitude, longitude }))
        })
      })
        .then(async (response) => await response.json())
        .then(({ estates }) => {
          setResultEstates(estates as Estate[])
          setMode('drag')
        })
        .catch(console.error)
    },
    [mode, vertexes]
  )

  const onFabClick = useCallback(() => {
    setMode((mode) => (mode === 'drag' ? 'nazotte' : 'drag'))
  }, [])

  const computeDegree = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const abs1 = Math.sqrt(x1 * x1 + y1 * y1)
    const abs2 = Math.sqrt(x2 * x2 + y2 * y2)
    let theta = Math.acos((x1 * x2 + y1 * y2) / (abs1 * abs2)) // 内積を使って角度を計算
    const sign = Math.sign(x1 * y2 - y1 * x2) // 外積を使って符号を計算
    theta *= sign
    return theta
  }, [])

  const isInsideByWindingNumberAlgorighm = useCallback(
    (point: Vertex, polygon: Vertex[]) => {
      const x = point[0]
      const y = point[1]

      let thetaSum = 0
      const n = polygon.length

      // i-1 => 指定された点 =>  i の成す角度の和をthetaSumに足し込んでいく
      for (let i = 1; i < n; i++) {
        if (polygon[i][0] === x && polygon[i][1] === y) {
          // 指定された点が多角形の角の場合うまく角度が計算できないので、判明した時点でtrueを返す
          return true
        }
        const v1x = polygon[i - 1][0] - x
        const v1y = polygon[i - 1][1] - y
        const v2x = polygon[i][0] - x
        const v2y = polygon[i][1] - y
        thetaSum += computeDegree(v1x, v1y, v2x, v2y)
      }
      // 0とN番目の成す角度
      if (polygon[0][0] === x && polygon[0][1] === y) {
        return true
      }
      const v1x = polygon[n - 1][0] - x
      const v1y = polygon[n - 1][1] - y
      const v2x = polygon[0][0] - x
      const v2y = polygon[0][1] - y
      thetaSum += computeDegree(v1x, v1y, v2x, v2y)
      thetaSum = Math.abs(thetaSum)

      console.log(thetaSum)
      if (thetaSum >= 0.1) {
        return true
      }
      return false
    },
    [computeDegree]
  )

  return (
    <>
      <Map
        className={classes.map}
        center={[center.latitude, center.longitude]}
        zoom={zoom}
        onmousedown={onNazotteStart}
        onmousemove={onNazotte}
        onmouseup={onNazotteEnd}
        dragging={mode === 'drag'}
      >
        <TileLayer
          attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={mode === 'nazotte' ? 0.5 : 1}
        />

        {resultEstates.map((estate, i) => {
          const isInside = isInsideByWindingNumberAlgorighm(
            [estate.latitude, estate.longitude],
            vertexes
          )
          return isInside ? <EstateMarker key={i} estate={estate} /> : null
          // return <EstateMarker key={i} estate={estate} />
        })}

        {vertexes.length > 0 &&
          (isDragging ? <Polyline positions={vertexes} /> : <Polygon positions={vertexes} />)}
      </Map>
      <Fab className={classes.fab} onClick={onFabClick} color="primary">
        {mode === 'drag' ? <TouchAppIcon /> : <PanToolIcon />}
      </Fab>
    </>
  )
}
