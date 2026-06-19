{{-- error: @foreach is never closed with @endforeach --}}
<ul>
    @foreach ($posts as $post)
        <li>{{ $post->title }}</li>
</ul>
