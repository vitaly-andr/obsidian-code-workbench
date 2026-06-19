{{-- User dashboard --}}
@extends('layouts.app')

@section('content')
<div class="dashboard">
    <h1>Welcome, {{ $user->name }}</h1>
    @if ($user->isAdmin())
        <a href="/admin">Admin panel</a>
    @endif
    <ul>
        @foreach ($posts as $post)
            <li>{{ $post->title }} — {!! $post->excerpt !!}</li>
        @endforeach
    </ul>
    @php
        $count = count($posts);
    @endphp
    <p>{{ $count }} posts</p>
</div>
@endsection
