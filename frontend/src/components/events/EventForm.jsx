import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, UploadCloud, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import RichTextEditor from '@/components/events/RichTextEditor'
import {
  createEvent,
  updateEvent,
  uploadEventPhoto,
  generateZoomLink,
  searchOsmLocations,
} from '@/lib/events-api'
import { eventFormSchema, getDefaultEventFormValues, toEventFormValues } from '@/lib/event-schema'

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function FormError({ error }) {
  if (!error) return null
  return <p className="text-sm text-destructive">{error.message}</p>
}

function buildOsmEmbedUrl(lat, lng) {
  const delta = 0.01
  const left = lng - delta
  const right = lng + delta
  const top = lat + delta
  const bottom = lat - delta

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`
}

function transformPayload(values) {
  return {
    ...values,
    description: values.description || null,
    photoUrl: values.photoUrl || null,
    startDatetime: new Date(values.startDatetime).toISOString(),
    endDatetime: new Date(values.endDatetime).toISOString(),
    locationAddress: values.locationType === 'physical' ? values.locationAddress || null : null,
    locationLat:
      values.locationType === 'physical' && values.locationLat !== null && values.locationLat !== undefined
        ? Number(values.locationLat)
        : null,
    locationLng:
      values.locationType === 'physical' && values.locationLng !== null && values.locationLng !== undefined
        ? Number(values.locationLng)
        : null,
    zoomMeetingLink: values.locationType === 'virtual' ? values.zoomMeetingLink || null : null,
    ticketPrice: values.isPaid ? Number(values.ticketPrice || 0) : 0,
    capacityLimit: values.capacityType === 'limited' ? Number(values.capacityLimit) : null,
  }
}

export default function EventForm({ mode = 'create', initialEvent = null, onSuccess }) {
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(initialEvent?.photoUrl || '')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [isSearchingLocations, setIsSearchingLocations] = useState(false)

  const defaultValues = useMemo(
    () => (initialEvent ? toEventFormValues(initialEvent) : getDefaultEventFormValues()),
    [initialEvent]
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(eventFormSchema),
    defaultValues,
  })

  useEffect(() => {
    reset(defaultValues)
    setPreviewUrl(defaultValues.photoUrl || '')
  }, [defaultValues, reset])

  const locationType = watch('locationType')
  const isPaid = watch('isPaid')
  const capacityType = watch('capacityType')
  const locationLat = watch('locationLat')
  const locationLng = watch('locationLng')
  const locationAddress = watch('locationAddress')

  const hasMapCoordinates =
    typeof locationLat === 'number' &&
    !Number.isNaN(locationLat) &&
    typeof locationLng === 'number' &&
    !Number.isNaN(locationLng)

  useEffect(() => {
    if (locationType === 'physical') {
      setValue('zoomMeetingLink', '')
    }

    if (locationType === 'virtual') {
      setLocationSuggestions([])
      setValue('locationAddress', '')
      setValue('locationLat', null)
      setValue('locationLng', null)
    }
  }, [locationType, setValue])

  useEffect(() => {
    if (locationType !== 'physical') {
      return
    }

    const query = (locationAddress || '').trim()
    if (query.length < 3) {
      setLocationSuggestions([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearchingLocations(true)
      try {
        const locations = await searchOsmLocations(query, 5)
        if (!cancelled) {
          setLocationSuggestions(locations)
        }
      } catch {
        if (!cancelled) {
          setLocationSuggestions([])
        }
      } finally {
        if (!cancelled) {
          setIsSearchingLocations(false)
        }
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [locationType, locationAddress])

  function selectLocationSuggestion(suggestion) {
    setValue('locationAddress', suggestion.displayName, { shouldValidate: true, shouldDirty: true })
    setValue('locationLat', suggestion.lat, { shouldValidate: true, shouldDirty: true })
    setValue('locationLng', suggestion.lng, { shouldValidate: true, shouldDirty: true })
    setLocationSuggestions([])
  }

  async function geocodeAddressIfNeeded() {
    const address = (getValues('locationAddress') || '').trim()
    const lat = getValues('locationLat')
    const lng = getValues('locationLng')

    if (!address || (typeof lat === 'number' && typeof lng === 'number')) {
      return
    }

    try {
      const [first] = await searchOsmLocations(address, 1)
      if (!first) return

      setValue('locationAddress', first.displayName, { shouldValidate: true, shouldDirty: true })
      setValue('locationLat', first.lat, { shouldValidate: true, shouldDirty: true })
      setValue('locationLng', first.lng, { shouldValidate: true, shouldDirty: true })
    } catch {
    }
  }

  async function onPhotoSelected(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Only JPG, PNG, or WebP images are allowed')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }

    setIsUploadingPhoto(true)
    try {
      const photo = await uploadEventPhoto(file)
      setValue('photoUrl', photo.url, { shouldValidate: true, shouldDirty: true })
      setPreviewUrl(photo.url)
      toast.success('Photo uploaded')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsUploadingPhoto(false)
      event.target.value = ''
    }
  }

  async function onGenerateZoomLink() {
    try {
      const values = getValues()
      const zoom = await generateZoomLink({
        topic: values.name || 'Mehfil Event',
        agenda: (values.description || '').replace(/<[^>]+>/g, '').slice(0, 900),
        startDatetime: values.startDatetime ? new Date(values.startDatetime).toISOString() : undefined,
        endDatetime: values.endDatetime ? new Date(values.endDatetime).toISOString() : undefined,
        timezone: values.timezone,
      })

      setValue('zoomMeetingLink', zoom.link, { shouldValidate: true, shouldDirty: true })

      if (zoom.generated) {
        toast.success('Zoom meeting link generated')
      } else {
        toast.warning(zoom.note || 'Zoom fallback link returned')
        if (zoom.diagnostics?.zoomApi) {
          console.info('Zoom generation diagnostics', zoom.diagnostics)
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function onSubmit(values) {
    try {
      const payload = transformPayload(values)
      const result =
        mode === 'create'
          ? await createEvent(payload)
          : await updateEvent(initialEvent.shortId, payload)

      toast.success(mode === 'create' ? 'Event created successfully' : 'Event updated successfully')
      onSuccess?.(result.event)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Event Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Event Name</Label>
            <Input id="name" placeholder="e.g. React Builders Meetup" {...register('name')} />
            <FormError error={errors.name} />
          </div>

          <div className="space-y-2">
            <Label>Event Photo</Label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted/50">
                {isUploadingPhoto ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Upload Image
                  </>
                )}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhotoSelected} />
              </label>
              <p className="text-xs text-muted-foreground">Max 5MB, JPG/PNG/WebP</p>
            </div>
            {previewUrl ? (
              <img src={previewUrl} alt="Event preview" className="h-48 w-full rounded-md border object-cover" />
            ) : null}
            <FormError error={errors.photoUrl} />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Controller
              control={control}
              name="description"
              render={({ field }) => <RichTextEditor value={field.value || ''} onChange={field.onChange} />}
            />
            <FormError error={errors.description} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Date, Time & Timezone</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="startDatetime">Start</Label>
            <Input id="startDatetime" type="datetime-local" {...register('startDatetime')} />
            <FormError error={errors.startDatetime} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDatetime">End</Label>
            <Input id="endDatetime" type="datetime-local" {...register('endDatetime')} />
            <FormError error={errors.endDatetime} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" placeholder="e.g. America/New_York" {...register('timezone')} />
            <FormError error={errors.timezone} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input type="radio" value="physical" {...register('locationType')} />
              Physical Event
            </label>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input type="radio" value="virtual" {...register('locationType')} />
              Virtual Event
            </label>
          </div>

          {locationType === 'physical' ? (
            <div className="space-y-3">
              <Label htmlFor="locationAddress">Address (OpenStreetMap)</Label>
              <div className="relative">
                <Input
                  id="locationAddress"
                  placeholder="Search address..."
                  autoComplete="off"
                  {...register('locationAddress')}
                  onBlur={() => {
                    setTimeout(() => {
                      setLocationSuggestions([])
                      geocodeAddressIfNeeded()
                    }, 120)
                  }}
                />
                {isSearchingLocations ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}

                {locationSuggestions.length > 0 ? (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
                    {locationSuggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.osmType || 'osm'}-${suggestion.osmId || index}`}
                        type="button"
                        className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          selectLocationSuggestion(suggestion)
                        }}
                      >
                        {suggestion.displayName}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <FormError error={errors.locationAddress} />

              {hasMapCoordinates ? (
                <div className="space-y-2">
                  <iframe
                    title="OpenStreetMap Preview"
                    src={buildOsmEmbedUrl(Number(locationLat), Number(locationLng))}
                    className="h-56 w-full rounded-md border"
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${locationLat}&mlon=${locationLng}#map=15/${locationLat}/${locationLng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Open in OpenStreetMap
                  </a>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="zoomMeetingLink">Zoom Meeting Link</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="zoomMeetingLink"
                  placeholder="https://zoom.us/j/..."
                  {...register('zoomMeetingLink')}
                />
                <Button type="button" variant="outline" onClick={onGenerateZoomLink}>
                  <WandSparkles className="mr-2 h-4 w-4" />
                  Generate
                </Button>
              </div>
              <FormError error={errors.zoomMeetingLink} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing & Capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isPaid')} />
            Paid event
          </label>

          {isPaid ? (
            <div className="space-y-2">
              <Label htmlFor="ticketPrice">Ticket Price (USD)</Label>
              <Input id="ticketPrice" type="number" min="0" step="0.01" {...register('ticketPrice')} />
              <FormError error={errors.ticketPrice} />
            </div>
          ) : null}

          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('requireApproval')} />
            Require host approval for registrations
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input type="radio" value="unlimited" {...register('capacityType')} />
              Unlimited Capacity
            </label>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input type="radio" value="limited" {...register('capacityType')} />
              Limited Capacity
            </label>
          </div>

          {capacityType === 'limited' ? (
            <div className="space-y-2">
              <Label htmlFor="capacityLimit">Capacity Limit</Label>
              <Input id="capacityLimit" type="number" min="1" max="100000" {...register('capacityLimit')} />
              <FormError error={errors.capacityLimit} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            {...register('status')}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <FormError error={errors.status} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || isUploadingPhoto}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === 'create' ? 'Create Event' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
