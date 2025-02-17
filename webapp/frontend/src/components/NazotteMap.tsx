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

  const isLeft = (p0: Vertex, p1: Vertex, p2: Vertex) => {
    const res = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
    return res
  }

  // ref: https://gist.github.com/vlasky/d0d1d97af30af3191fc214beaf379acc
  const pointInPolygon = (point: Vertex, polygon: Vertex[]): boolean => {
    const x = point[0]
    const y = point[1]
    let windingNumber = 0

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0]
      const yi = polygon[i][1]
      const xj = polygon[j][0]
      const yj = polygon[j][1]

      if (yj <= y) {
        if (yi > y) {
          if (isLeft([xj, yj], [xi, yi], [x, y]) > 0) {
            windingNumber++
          }
        }
      } else {
        if (yi <= y) {
          if (isLeft([xj, yj], [xi, yi], [x, y]) < 0) {
            windingNumber--
          }
        }
      }
    }
    return windingNumber !== 0
  }

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
          const isInside = pointInPolygon([estate.latitude, estate.longitude], vertexes)
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
